import {
  db,
  signals as signalsTable,
  events as eventsTable,
  eventSignals as eventSignalsTable,
  providers as providersTable,
  alertFingerprints as fingerprintsTable,
} from "@ai-radar/db";
import { and, eq, gte, inArray, isNull, or } from "drizzle-orm";
import {
  findMatchingEvent,
  isAnnouncementSource,
  computeLeadTimeMinutes,
  buildEventAggregate,
  formatTelegramAlert,
  resolvePublicSourceUrl,
  isMachineUrl,
  isHighSignalAlert,
  whyItMatters,
  buildAlertFingerprints,
  MAX_EVENT_OPEN_MS,
  type EventRecord,
  type SignalRecord,
  type QualitySignal,
} from "@ai-radar/detection";
import {
  sendTelegramMessage,
  meetsAlertThreshold,
  isAlertFresh,
  ALERT_MAX_AGE_MS,
  enrichAlert,
  enrichShouldSuppress,
  type EvidenceItem,
} from "@ai-radar/shared";

const FINGERPRINT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Pulls every uncorrelated signal (oldest first) and either attaches it to a
 * matching open PRE_ANNOUNCEMENT event or seeds a new one. Implements the
 * CORRELATION -> CONFIDENCE -> ALERT stages of the pipeline, plus the
 * PRE_ANNOUNCEMENT -> CONFIRMED transition when an official channel corroborates.
 *
 * Also re-checks unalerted open events so previously failed Telegram sends
 * can still deliver. Events first detected more than 48h ago are never
 * paged — that blocks sweep backfills of stale news.
 */
export async function runCorrelation(): Promise<{ correlated: number; alerted: number; alertFailed: number }> {
  await backfillAlertFingerprints();

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
      where: gte(eventsTable.firstDetectedAt, cutoff),
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
      { crossProvider: true },
    );
    if (match && match.providerId !== signal.providerId) {
      console.log(`[correlate] clustered signal ${signal.id} into event #${match.id} (cross-provider)`);
    }

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

  const freshCutoff = new Date(Date.now() - ALERT_MAX_AGE_MS);
  const candidates = await db.query.events.findMany({
    where: and(
      isNull(eventsTable.alertedAt),
      gte(eventsTable.firstDetectedAt, freshCutoff),
      or(eq(eventsTable.status, "PRE_ANNOUNCEMENT"), eq(eventsTable.status, "CONFIRMED")),
    ),
    orderBy: (e, { desc }) => [desc(e.firstDetectedAt)],
    limit: 80,
  });

  for (const event of candidates) {
    const official = event.status === "CONFIRMED";
    if (!meetsAlertThreshold(event.confidence, event.importance, { official })) continue;
    if (!isAlertFresh(event.firstDetectedAt)) continue;

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

type AlertOutcome = "alerted" | "alert_failed" | "skipped" | "updated" | "suppressed";

function publicUrlFromEvidence(raw: Record<string, unknown>, entity: string | null): string {
  return resolvePublicSourceUrl({
    crawlUrl: String(raw.crawlUrl ?? raw.sourceUrl ?? ""),
    sourceType: typeof raw.sourceType === "string" ? raw.sourceType : undefined,
    sourceName: typeof raw.sourceName === "string" ? raw.sourceName : undefined,
    itemUrl: typeof raw.itemUrl === "string" ? raw.itemUrl : typeof raw.url === "string" ? raw.url : null,
    modelId: typeof raw.modelId === "string" ? raw.modelId : null,
    hfRepo: typeof raw.hfRepo === "string" ? raw.hfRepo : null,
    repo: typeof raw.repo === "string" ? raw.repo : null,
    paperId: typeof raw.paperId === "string" ? raw.paperId : null,
    entity,
  });
}

async function backfillAlertFingerprints(): Promise<void> {
  const cutoff = new Date(Date.now() - FINGERPRINT_TTL_MS);
  const recent = await db.query.events.findMany({
    where: gte(eventsTable.alertedAt, cutoff),
    columns: { id: true, title: true, entity: true },
    limit: 250,
  });
  for (const e of recent) {
    await persistFingerprints(
      e.id,
      buildAlertFingerprints({ publicUrl: "", title: e.title, entity: e.entity, providerName: "" }),
    );
  }
}

async function matchingFingerprint(
  fps: ReturnType<typeof buildAlertFingerprints>,
): Promise<string | null> {
  if (fps.length === 0) return null;
  const cutoff = new Date(Date.now() - FINGERPRINT_TTL_MS);
  const rows = await db
    .select({ fingerprint: fingerprintsTable.fingerprint })
    .from(fingerprintsTable)
    .where(
      and(
        inArray(
          fingerprintsTable.fingerprint,
          fps.map((f) => f.fingerprint),
        ),
        gte(fingerprintsTable.createdAt, cutoff),
      ),
    )
    .limit(1);
  return rows[0]?.fingerprint ?? null;
}

async function persistFingerprints(
  eventId: number,
  fps: ReturnType<typeof buildAlertFingerprints>,
): Promise<void> {
  if (fps.length === 0) return;
  await db
    .insert(fingerprintsTable)
    .values(fps.map((f) => ({ fingerprint: f.fingerprint, kind: f.kind, eventId })))
    .onConflictDoNothing({ target: fingerprintsTable.fingerprint });
}

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
  const fresh = isAlertFresh(event.firstDetectedAt, now);

  const qualitySignals: QualitySignal[] = links.map((l) => ({
    title: l.signal.title,
    description: l.signal.description,
    sourceType: l.signal.sourceType,
    entity: l.signal.entity,
    suggestedEventType: l.signal.suggestedEventType,
    evidence: (l.signal.evidence ?? {}) as Record<string, unknown>,
  }));
  const quality = {
    eventType: aggregate.type,
    title: aggregate.title,
    summary: aggregate.summary,
    entity: aggregate.entity,
    importance: aggregate.importance,
    confidence: aggregate.confidence,
    official,
    signals: qualitySignals,
  };

  if (meetsAlertBar && !event.alertedAt && !fresh) {
    console.log(
      `[alert] skipped stale event #${eventId} firstDetected=${event.firstDetectedAt.toISOString()} ` +
        `(older than ${ALERT_MAX_AGE_MS / 3_600_000}h) "${aggregate.title}"`,
    );
    return "skipped";
  }

  if (meetsAlertBar && !event.alertedAt && !isHighSignalAlert(quality)) {
    await db
      .update(eventsTable)
      .set({ status: "DISMISSED", updatedAt: now })
      .where(eq(eventsTable.id, eventId));
    console.log(
      `[alert] suppressed low-signal event #${eventId} ${aggregate.type} "${aggregate.title}"`,
    );
    return "suppressed";
  }

  if (meetsAlertBar && !event.alertedAt) {
    const evidence: EvidenceItem[] = links.map((l) => {
      const raw = (l.signal.evidence ?? {}) as Record<string, unknown>;
      return {
        sourceUrl: publicUrlFromEvidence(raw, l.signal.entity ?? aggregate.entity),
        sourceType: l.signal.sourceType,
        signalType: l.signal.signalType,
        summary: l.signal.title,
        detectedAt: l.signal.detectedAt.toISOString(),
        confidenceContribution: l.signal.confidenceContribution,
        sourceName: typeof raw.sourceName === "string" ? raw.sourceName : undefined,
        stars: typeof raw.stars === "number" ? raw.stars : undefined,
      };
    });

    const primaryUrl = evidence.find((e) => e.sourceUrl)?.sourceUrl ?? "";
    const fps = buildAlertFingerprints({
      publicUrl: primaryUrl,
      title: aggregate.title,
      entity: aggregate.entity,
      providerName,
    });
    const dup = await matchingFingerprint(fps);
    if (dup) {
      await db.update(eventsTable).set({ alertedAt: now, updatedAt: now }).where(eq(eventsTable.id, eventId));
      console.log(`[alert] deduped event #${eventId} via ${dup} "${aggregate.title}"`);
      return "suppressed";
    }

    const leakish = /\b(leak|rumou?r|unreleased|codename|spotted|internal|mewfour|mythos|astra|daybreak)\b/i.test(
      `${aggregate.title} ${aggregate.summary}`,
    );
    const enrich = await enrichAlert({
      providerName,
      eventType: aggregate.type,
      title: aggregate.title,
      summary: aggregate.summary,
      entity: aggregate.entity,
      sourceUrl: primaryUrl,
      official,
    });
    if (enrich) {
      console.log(
        `[groq] enrich event #${eventId} social=${enrich.social} novelty=${enrich.novelty} skip=${enrich.skip} cluster=${enrich.clusterKey}`,
      );
      if (enrich.clusterKey) {
        fps.push({ fingerprint: `cluster:${enrich.clusterKey}`, kind: "story" });
        const clusterDup = await matchingFingerprint([{ fingerprint: `cluster:${enrich.clusterKey}`, kind: "story" }]);
        if (clusterDup) {
          await db.update(eventsTable).set({ alertedAt: now, updatedAt: now }).where(eq(eventsTable.id, eventId));
          console.log(`[alert] clustered/deduped event #${eventId} via ${clusterDup}`);
          return "suppressed";
        }
      }
      if (enrichShouldSuppress(enrich, { official, eventType: aggregate.type, leakish })) {
        await db.update(eventsTable).set({ status: "DISMISSED", updatedAt: now }).where(eq(eventsTable.id, eventId));
        console.log(`[alert] groq-suppressed event #${eventId} "${aggregate.title}"`);
        return "suppressed";
      }
    }

    const message = formatTelegramAlert({
      providerName,
      title: aggregate.title,
      summary: aggregate.summary,
      entity: aggregate.entity,
      eventType: aggregate.type,
      confidence: aggregate.confidence,
      importance: aggregate.importance,
      status,
      firstDetectedAt: event.firstDetectedAt,
      evidence,
      whyItMatters: enrich?.whyItMatters ?? whyItMatters(quality),
      whatHappensNext: enrich?.whatHappensNext,
      postAngle: enrich?.postAngle,
    });

    const send = await sendTelegramMessage(message, { preview: Boolean(primaryUrl) && !isMachineUrl(primaryUrl) });
    if (send.ok) {
      await db.update(eventsTable).set({ alertedAt: now }).where(eq(eventsTable.id, eventId));
      await persistFingerprints(eventId, fps);
      console.log(
        `[alert] SENT event #${eventId} conf=${aggregate.confidence} imp=${aggregate.importance} "${aggregate.title}" → ${primaryUrl}`,
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
        `(need conf≥60&imp≥6 OR imp≥8&conf≥30 OR imp≥6&conf≥40 OR official&imp≥6&conf≥15)`,
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
