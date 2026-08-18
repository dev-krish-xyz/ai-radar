import {
  db,
  sources as sourcesTable,
  providers as providersTable,
  signals as signalsTable,
} from "@ai-radar/db";
import { eq, sql } from "drizzle-orm";
import { processSource } from "./pipeline";
import { runCorrelation } from "./correlate";
import { purgeStaleData } from "./purge";
import { resetGroqTickBudget } from "@ai-radar/shared";

/** Parallel fetches; host-level rate limiter still serializes same-host requests. */
const CONCURRENCY = 5;

function isDue(source: typeof sourcesTable.$inferSelect, now: Date): boolean {
  if (!source.lastCrawledAt) return true;
  const dueAt = source.lastCrawledAt.getTime() + source.crawlIntervalMinutes * 60_000;
  return now.getTime() >= dueAt;
}

export interface TickSummary {
  due: number;
  ok: number;
  errors: number;
  signals: number;
  correlated: number;
  alerted: number;
  alertFailed: number;
  durationMs: number;
}

/** Runs one crawl tick: crawls every due, enabled source (bounded concurrency), then correlates. */
export async function runTick(): Promise<TickSummary> {
  resetGroqTickBudget();
  const started = Date.now();
  const now = new Date();
  const summary: TickSummary = {
    due: 0,
    ok: 0,
    errors: 0,
    signals: 0,
    correlated: 0,
    alerted: 0,
    alertFailed: 0,
    durationMs: 0,
  };

  const enabledSources = await db.query.sources.findMany({
    where: eq(sourcesTable.enabled, true),
    with: { provider: true },
  });

  const due = enabledSources.filter((s) => s.provider.enabled && isDue(s, now));
  summary.due = due.length;

  if (due.length === 0) {
    console.log("[scheduler] no sources due");
  } else {
    // Priority order: lower provider.priority first, then faster cadences.
    due.sort((a, b) => {
      const p = a.provider.priority - b.provider.priority;
      if (p !== 0) return p;
      return a.crawlIntervalMinutes - b.crawlIntervalMinutes;
    });

    console.log(`[scheduler] ${due.length} source(s) due (of ${enabledSources.length} enabled)`);
    for (let i = 0; i < due.length; i += CONCURRENCY) {
      const batch = due.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (s) => {
          try {
            const result = await processSource(s, s.provider);
            if (result.status === "error") {
              summary.errors += 1;
              console.error(
                `[crawl] FAIL ${s.provider.name}/${s.name}: ${result.error ?? result.status}` +
                  (result.fetchUrl && result.fetchUrl !== s.url ? ` (via ${result.fetchUrl})` : ""),
              );
            } else {
              summary.ok += 1;
              summary.signals += result.signalsCreated;
              console.log(
                `[crawl] ${s.provider.name}/${s.name}: ${result.status} (${result.signalsCreated} signal(s))`,
              );
            }
          } catch (err) {
            summary.errors += 1;
            console.error(`[crawl] ${s.provider.name}/${s.name} threw:`, err);
            try {
              await db
                .update(sourcesTable)
                .set({
                  lastCrawledAt: new Date(),
                  lastStatus: `error: thrown ${err instanceof Error ? err.message : String(err)}`.slice(0, 500),
                })
                .where(eq(sourcesTable.id, s.id));
            } catch {
              /* ignore secondary failure */
            }
          }
        }),
      );
    }
  }

  try {
    const corr = await runCorrelation();
    summary.correlated = corr.correlated;
    summary.alerted = corr.alerted;
    summary.alertFailed = corr.alertFailed;
  } catch (err) {
    console.error("[scheduler] correlation stage failed:", err);
  }

  try {
    await purgeStaleData();
  } catch (err) {
    console.error("[scheduler] purge failed:", err);
  }

  summary.durationMs = Date.now() - started;

  // Surface stuck error sources so a broken pipeline is obvious in logs every tick.
  const errorSources = await db
    .select({
      n: sql<number>`count(*)::int`,
    })
    .from(sourcesTable)
    .where(sql`${sourcesTable.enabled} = true AND ${sourcesTable.lastStatus} ILIKE 'error%'`);
  const errCount = errorSources[0]?.n ?? 0;

  console.log(
    `[scheduler] tick done in ${summary.durationMs}ms — due=${summary.due} ok=${summary.ok} ` +
      `errors=${summary.errors} signals=${summary.signals} correlated=${summary.correlated} ` +
      `alerted=${summary.alerted} alertFailed=${summary.alertFailed} sourcesInError=${errCount}`,
  );

  if (errCount > 0) {
    const broken = await db.query.sources.findMany({
      where: sql`${sourcesTable.enabled} = true AND ${sourcesTable.lastStatus} ILIKE 'error%'`,
      with: { provider: true },
      limit: 10,
    });
    for (const s of broken) {
      console.error(`[health] source in error: ${s.provider.name}/${s.name} → ${s.lastStatus}`);
    }
  }

  return summary;
}

/** One-shot connectivity snapshot for startup logs / API health. */
export async function pipelineHealth(): Promise<{
  providersEnabled: number;
  sourcesEnabled: number;
  sourcesInError: number;
  signalsUncorrelated: number;
  eventsUnalertedMeetingBar: number;
  lastCrawlAt: Date | string | null;
}> {
  const providersEnabled = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(providersTable)
    .where(eq(providersTable.enabled, true));

  const sourcesEnabled = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sourcesTable)
    .where(eq(sourcesTable.enabled, true));

  const sourcesInError = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sourcesTable)
    .where(sql`${sourcesTable.enabled} = true AND ${sourcesTable.lastStatus} ILIKE 'error%'`);

  const uncorr = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(signalsTable)
    .where(eq(signalsTable.correlated, false));

  // conf/imp already stored on events (post-recompute).
  const unalerted = await db.execute(sql`
    SELECT count(*)::int AS n FROM events
    WHERE alerted_at IS NULL
      AND status IN ('PRE_ANNOUNCEMENT', 'CONFIRMED')
      AND first_detected_at >= now() - interval '48 hours'
      AND (
        (confidence >= 60 AND importance >= 6)
        OR (importance >= 8 AND confidence >= 35)
        OR (importance >= 6 AND confidence >= 40)
        OR (status = 'CONFIRMED' AND importance >= 6 AND confidence >= 15)
      )
  `);

  const last = await db
    .select({ t: sql<Date | string | null>`max(${sourcesTable.lastCrawledAt})` })
    .from(sourcesTable);

  const unalertedRows = (Array.isArray(unalerted) ? unalerted : []) as { n?: number }[];

  return {
    providersEnabled: providersEnabled[0]?.n ?? 0,
    sourcesEnabled: sourcesEnabled[0]?.n ?? 0,
    sourcesInError: sourcesInError[0]?.n ?? 0,
    signalsUncorrelated: uncorr[0]?.n ?? 0,
    eventsUnalertedMeetingBar: Number(unalertedRows[0]?.n ?? 0),
    lastCrawlAt: last[0]?.t ?? null,
  };
}
