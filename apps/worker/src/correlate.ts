import {
  db,
  signals as signalsTable,
  events as eventsTable,
  eventSignals as eventSignalsTable,
  providers as providersTable,
} from "@ai-radar/db";
import { and, eq, gte } from "drizzle-orm";
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
  ALERT_CONFIDENCE_THRESHOLD,
  ALERT_IMPORTANCE_THRESHOLD,
  type EvidenceItem,
} from "@ai-radar/shared";

/**
 * Pulls every uncorrelated signal (oldest first) and either attaches it to a
 * matching open PRE_ANNOUNCEMENT event or seeds a new one. Implements the
 * CORRELATION -> CONFIDENCE -> ALERT stages of the pipeline, plus the
 * PRE_ANNOUNCEMENT -> CONFIRMED transition when an official channel corroborates.
 */
export async function runCorrelation(): Promise<void> {
  const pending = await db.query.signals.findMany({
    where: eq(signalsTable.correlated, false),
    orderBy: (s, { asc }) => [asc(s.detectedAt)],
  });

  if (pending.length === 0) return;

  const providerCache = new Map<number, typeof providersTable.$inferSelect>();
  const getProvider = async (id: number) => {
    if (!providerCache.has(id)) {
      const p = await db.query.providers.findFirst({ where: eq(providersTable.id, id) });
      if (p) providerCache.set(id, p);
    }
    return providerCache.get(id)!;
  };

  for (const signal of pending) {
    const provider = await getProvider(signal.providerId);
    if (!provider) continue;

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
    if (!match) {
      // createEvent already links the seeding signal.
    } else {
      await db.insert(eventSignalsTable).values({
        eventId,
        signalId: signal.id,
        contribution: signal.confidenceContribution,
      });
    }

    await db.update(signalsTable).set({ correlated: true }).where(eq(signalsTable.id, signal.id));

    await recomputeAndMaybeAlert(eventId, provider.name, signal.sourceType, signal.detectedAt);
  }
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

  return row!.id;
}

async function recomputeAndMaybeAlert(
  eventId: number,
  providerName: string,
  newSignalSourceType: string,
  newSignalDetectedAt: Date,
): Promise<void> {
  const event = await db.query.events.findFirst({ where: eq(eventsTable.id, eventId) });
  if (!event) return;

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

  const meetsAlertBar = aggregate.confidence >= ALERT_CONFIDENCE_THRESHOLD && aggregate.importance >= ALERT_IMPORTANCE_THRESHOLD;

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

    await sendTelegramMessage(message);
    await db.update(eventsTable).set({ alertedAt: now }).where(eq(eventsTable.id, eventId));
  } else if (justConfirmed && event.alertedAt) {
    await sendTelegramMessage(
      `✅ <b>CONFIRMED</b>\n\n${aggregate.title}\n\nLead time: ${leadTimeMinutes} minutes`,
    );
  }
}
