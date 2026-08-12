import { db, providers as providersTable, sources as sourcesTable } from "@ai-radar/db";
import { and, eq } from "drizzle-orm";
import { ALL_PROVIDERS, CRAWL_INTERVALS } from "@ai-radar/providers";

async function seed(): Promise<void> {
  for (const p of ALL_PROVIDERS) {
    const [row] = await db
      .insert(providersTable)
      .values({ name: p.name, slug: p.slug, tier: p.tier, priority: p.priority, enabled: p.enabled })
      .onConflictDoUpdate({
        target: providersTable.slug,
        set: { name: p.name, tier: p.tier, priority: p.priority, enabled: p.enabled },
      })
      .returning();

    const providerId = row!.id;

    for (const s of p.sources) {
      const interval = s.crawlIntervalMinutes ?? CRAWL_INTERVALS[s.type];
      const existing = await db.query.sources.findFirst({
        where: and(eq(sourcesTable.providerId, providerId), eq(sourcesTable.url, s.url)),
      });

      if (existing) {
        await db
          .update(sourcesTable)
          .set({
            name: s.name,
            type: s.type,
            crawlIntervalMinutes: interval,
            enabled: s.enabled ?? true,
          })
          .where(eq(sourcesTable.id, existing.id));
      } else {
        await db.insert(sourcesTable).values({
          providerId,
          name: s.name,
          url: s.url,
          type: s.type,
          crawlIntervalMinutes: interval,
          enabled: s.enabled ?? true,
        });
      }
    }

    console.log(`[seed] ${p.name}: ${p.sources.length} source(s)`);
  }

  console.log("[seed] done");
}

await seed();
process.exit(0);
