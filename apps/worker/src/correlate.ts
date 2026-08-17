import {
  db,
  signals as signalsTable,
  events as eventsTable,
  eventSignals as eventSignalsTable,
  providers as providersTable,
} from "@ai-radar/db";
import { and, eq, gte, isNull, or } from "drizzle-orm";
import {
  findMatchingEvent,
  isAnnouncementSource,
  computeLeadTimeMinutes,
  buildEventAggregate,
  formatTelegramAlert,
  MAX_EVENT_OPEN_MS,
  type EventRecord,
  type SignalRecord,
} from "@ai-radar/detection";
import {
  sendTelegramMessage,
  meetsAlertThreshold,
  type EvidenceItem,
} from "@ai-radar/shared";

/**
 * Pulls every uncorrelated signal (oldest first) and either attaches it to a
 * matching open PRE_ANNOUNCEMENT event or seeds a new one. Implements the
 * CORRELATION -> CONFIDENCE -> ALERT stages of the pipeline, plus the
 * PRE_ANNOUNCEMENT -> CONFIRMED transition when an official channel corroborates.
 *
 * Also re-checks unalerted open events so threshold changes or previously failed
 * Telegram sends can still deliver.
 */
export async function runCorrelation(): Promise<{ correlated: number; alerted: number; alertFailed: number }> {
  const pending = await db.query.signals.findMany({
    where: eq(signalsTable.correlated, false),
    orderBy: (s, { asc }) => [asc(s.detectedAt)],
  });

  let correlated = 0;
  let alerted = 0;
  let alertFailed = 0;

  if (pending.length > 0) {
    console.log(`[correlate] ${pending.length} uncorrelated signal(s)`);
  }

  const providerCache = new Map<number, typeof providersTable.$inferSelect>();
  const getProvider = async (id: number) => {
    if (!providerCache.has(id)) {
      const p = await db.query.providers.findFirst({ where: eq(providersTable.id, id) });
      if (p) providerCache.set(id, p);
    }
    return providerCache.get(id);
  };

  for (const signal of pending) {
    const provider = await getProvider(signal.providerId);
    if (!provider) {
      console.error(`[correlate] signal ${signal.id} has missing provider ${signal.providerId}; leaving uncorrelated`);
      continue;
    }

    const now = new Date();
    const cutoff = new Date(now.getTime() - MAX_EVENT_OPEN_MS);
    const candidateEvents = await db.query.events.findMany({
      where: and(eq(eventsTable.providerId, signal.providerId), gte(eventsTable.firstDetectedAt, cutoff)),
    });

    const asEventRecords: EventRecord[] = candidateEvents.map((e) => ({
      id: e.id,
      providerId: e.providerId,
      type: e.type,
      title: e.title,
      summary: e.summary,
      entity: e.entity,
      status: e.status,
      firstDetectedAt: e.firstDetectedAt,
      updatedAt: e.updatedAt,
    }));

    const match = findMatchingEvent(
      { entity: signal.entity, title: signal.title, description: signal.description, detectedAt: signal.detectedAt },
      signal.providerId,
      asEventRecords,
      now,
    );

    const eventId = match ? match.id : await createEvent(provider, signal, now);
    if (match) {
      await db.insert(eventSignalsTable).values({
        eventId,
        signalId: signal.id,
        contribution: signal.confidenceContribution,
      });
    }

    await db.update(signalsTable).set({ correlated: true }).where(eq(signalsTable.id, signal.id));
    correlated += 1;

    const result = await recomputeAndMaybeAlert(eventId, provider.name, signal.sourceType, signal.detectedAt);
    if (result === "alerted") alerted += 1;
    if (result === "alert_failed") alertFailed += 1;
  }

  // Sweep: events that already meet the bar but never successfully alerted
  // (threshold was raised historically, Telegram was down, etc.).
  const sweep = await sweepUnalertedEvents(providerCache);
  alerted += sweep.alerted;
  alertFailed += sweep.alertFailed;

  return { correlated, alerted, alertFailed };
}

async function sweepUnalertedEvents(
  providerCache: Map<number, typeof providersTable.$inferSelect>,
): Promise<{ alerted: number; alertFailed: number }> {
  let alerted = 0;
  let alertFailed = 0;

  const candidates = await db.query.events.findMany({
    where: and(
      isNull(eventsTable.alertedAt),
      or(eq(eventsTable.status, "PRE_ANNOUNCEMENT"), eq(eventsTable.status, "CONFIRMED")),
    ),
    orderBy: (e, { desc }) => [desc(e.firstDetectedAt)],
    limit: 80,
  });

  for (const event of candidates) {
    const official = event.status === "CONFIRMED";
    if (!meetsAlertThreshold(event.confidence, event.importance, { official })) continue;

    let provider = providerCache.get(event.providerId);
    if (!provider) {
      provider = await db.query.providers.findFirst({ where: eq(providersTable.id, event.providerId) });
      if (provider) providerCache.set(event.providerId, provider);
    }
    if (!provider) continue;

    console.log(
      `[alert] sweep: event #${event.id} "${event.title}" conf=${event.confidence} imp=${event.importance} never alerted — retrying`,
    );
    // Pass a non-announcement source type so the sweep cannot flip PRE_ANNOUNCEMENT → CONFIRMED.
    const result = await recomputeAndMaybeAlert(event.id, provider.name, "docs", event.firstDetectedAt);
    if (result === "alerted") alerted += 1;
    if (result === "alert_failed") alertFailed += 1;
  }

  return { alerted, alertFailed };
}

async function createEvent(
  provider: typeof providersTable.$inferSelect,
  signal: typeof signalsTable.$inferSelect,
  now: Date,
): Promise<number> {
  const record: SignalRecord = {
    id: signal.id,
    signalType: signal.signalType,
    suggestedEventType: signal.suggestedEventType,
    entity: signal.entity,
    title: signal.title,
    description: signal.description,
    confidenceContribution: signal.confidenceContribution,
    sourceType: signal.sourceType,
    detectedAt: signal.detectedAt,
  };
  const aggregate = buildEventAggregate(provider.name, [record]);

  const announced = isAnnouncementSource(signal.sourceType);

  const [row] = await db
    .insert(eventsTable)
    .values({
      providerId: provider.id,
      type: aggregate.type,
      entity: aggregate.entity,
      title: aggregate.title,
      summary: aggregate.summary,
      confidence: aggregate.confidence,
      importance: aggregate.importance,
      status: announced ? "CONFIRMED" : "PRE_ANNOUNCEMENT",
      firstDetectedAt: signal.detectedAt,
      officiallyAnnouncedAt: announced ? signal.detectedAt : null,
      confirmedAt: announced ? now : null,
      leadTimeMinutes: announced ? 0 : null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await db.insert(eventSignalsTable).values({
    eventId: row!.id,
    signalId: signal.id,
    contribution: signal.confidenceContribution,
  });

  console.log(
    `[correlate] new event #${row!.id} ${aggregate.type} conf=${aggregate.confidence} imp=${aggregate.importance} ` +
      `"${aggregate.title}" (meetsAlert=${meetsAlertThreshold(aggregate.confidence, aggregate.importance, { official: announced })})`,
  );

  return row!.id;
}

type AlertOutcome = "alerted" | "alert_failed" | "skipped" | "updated";

async function recomputeAndMaybeAlert(
  eventId: number,
  providerName: string,
  newSignalSourceType: string,
  newSignalDetectedAt: Date,
): Promise<AlertOutcome> {
  const event = await db.query.events.findFirst({ where: eq(eventsTable.id, eventId) });
  if (!event) return "skipped";

  const links = await db.query.eventSignals.findMany({
    where: eq(eventSignalsTable.eventId, eventId),
    with: { signal: true },
  });
  const signalRecords: SignalRecord[] = links.map((l) => ({
    id: l.signal.id,
    signalType: l.signal.signalType,
    suggestedEventType: l.signal.suggestedEventType,
    entity: l.signal.entity,
    title: l.signal.title,
    description: l.signal.description,
    confidenceContribution: l.signal.confidenceContribution,
    sourceType: l.signal.sourceType,
    detectedAt: l.signal.detectedAt,
  }));

  const aggregate = buildEventAggregate(providerName, signalRecords);
  const now = new Date();

  let status = event.status;
  let officiallyAnnouncedAt = event.officiallyAnnouncedAt;
  let confirmedAt = event.confirmedAt;
  let leadTimeMinutes = event.leadTimeMinutes;
  let justConfirmed = false;

  if (status === "PRE_ANNOUNCEMENT" && isAnnouncementSource(newSignalSourceType)) {
    status = "CONFIRMED";
    officiallyAnnouncedAt = newSignalDetectedAt;
    confirmedAt = now;
    leadTimeMinutes = computeLeadTimeMinutes(event.firstDetectedAt, newSignalDetectedAt);
    justConfirmed = true;
  }

  await db
    .update(eventsTable)
    .set({
      type: aggregate.type,
      entity: aggregate.entity,
      title: aggregate.title,
      summary: aggregate.summary,
      confidence: aggregate.confidence,
      importance: aggregate.importance,
      status,
      officiallyAnnouncedAt,
      confirmedAt,
      leadTimeMinutes,
      updatedAt: now,
    })
    .where(eq(eventsTable.id, eventId));

  const official =
    status === "CONFIRMED" ||
    isAnnouncementSource(newSignalSourceType) ||
    signalRecords.some((s) => isAnnouncementSource(s.sourceType));
  const meetsAlertBar = meetsAlertThreshold(aggregate.confidence, aggregate.importance, { official });

  if (meetsAlertBar && !event.alertedAt) {
    const evidence: EvidenceItem[] = links.map((l) => ({
      sourceUrl: (l.signal.evidence as { sourceUrl?: string }).sourceUrl ?? "",
      sourceType: l.signal.sourceType,
      signalType: l.signal.signalType,
      summary: l.signal.title,
      detectedAt: l.signal.detectedAt.toISOString(),
      confidenceContribution: l.signal.confidenceContribution,
    }));

    const message = formatTelegramAlert({
      providerName,
      title: aggregate.title,
      confidence: aggregate.confidence,
      importance: aggregate.importance,
      status,
      firstDetectedAt: event.firstDetectedAt,
      evidence,
    });

    const send = await sendTelegramMessage(message);
    if (send.ok) {
      await db.update(eventsTable).set({ alertedAt: now }).where(eq(eventsTable.id, eventId));
      console.log(
        `[alert] SENT event #${eventId} conf=${aggregate.confidence} imp=${aggregate.importance} "${aggregate.title}"`,
      );
      return "alerted";
    }

    // Critical: do NOT set alertedAt on failure — next tick / sweep will retry.
    console.error(
      `[alert] FAILED event #${eventId} conf=${aggregate.confidence} imp=${aggregate.importance}: ` +
        `${send.error ?? `HTTP ${send.status}`}${send.skipped ? " (telegram not configured)" : ""}`,
    );
    return "alert_failed";
  }

  if (!meetsAlertBar && !event.alertedAt) {
    console.log(
      `[alert] below threshold event #${eventId} conf=${aggregate.confidence} imp=${aggregate.importance} official=${official} ` +
        `(need conf≥60&imp≥6 OR imp≥8&conf≥35 OR imp≥6&conf≥40 OR official&imp≥6&conf≥15)`,
    );
  }

  if (justConfirmed && event.alertedAt) {
    const send = await sendTelegramMessage(
      `✅ <b>CONFIRMED</b>\n\n${aggregate.title}\n\nLead time: ${leadTimeMinutes} minutes`,
    );
    if (!send.ok) {
      console.error(`[alert] confirmation send failed for event #${eventId}: ${send.error ?? send.status}`);
      return "alert_failed";
    }
    return "alerted";
  }

  return "updated";
}
