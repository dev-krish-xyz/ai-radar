import { db, sources as sourcesTable, providers as providersTable } from "@ai-radar/db";
import { eq } from "drizzle-orm";
import { processSource } from "./pipeline";
import { runCorrelation } from "./correlate";

const CONCURRENCY = 3;

function isDue(source: typeof sourcesTable.$inferSelect, now: Date): boolean {
  if (!source.lastCrawledAt) return true;
  const dueAt = source.lastCrawledAt.getTime() + source.crawlIntervalMinutes * 60_000;
  return now.getTime() >= dueAt;
}

/** Runs one crawl tick: crawls every due, enabled source (bounded concurrency), then correlates. */
export async function runTick(): Promise<void> {
  const now = new Date();

  const enabledSources = await db.query.sources.findMany({
    where: eq(sourcesTable.enabled, true),
    with: { provider: true },
  });

  const due = enabledSources.filter(
    (s) => s.provider.enabled && isDue(s, now),
  );

  if (due.length === 0) {
    console.log("[scheduler] no sources due");
  } else {
    console.log(`[scheduler] ${due.length} source(s) due`);
    for (let i = 0; i < due.length; i += CONCURRENCY) {
      const batch = due.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (s) => {
          try {
            const result = await processSource(s, s.provider);
            console.log(`[crawl] ${s.provider.name}/${s.name}: ${result.status} (${result.signalsCreated} signal(s))`);
          } catch (err) {
            console.error(`[crawl] ${s.provider.name}/${s.name} failed:`, err);
          }
        }),
      );
    }
  }

  await runCorrelation();
}
