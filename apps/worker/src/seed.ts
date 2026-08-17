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
    const keepUrls: string[] = [];
    const keepNames: string[] = [];

    for (const s of p.sources) {
      const interval = s.crawlIntervalMinutes ?? CRAWL_INTERVALS[s.type];
      keepUrls.push(s.url);
      keepNames.push(s.name);

      // Prefer match by URL, then by name (so URL migrations update in place).
      let existing = await db.query.sources.findFirst({
        where: and(eq(sourcesTable.providerId, providerId), eq(sourcesTable.url, s.url)),
      });
      if (!existing) {
        existing = await db.query.sources.findFirst({
          where: and(eq(sourcesTable.providerId, providerId), eq(sourcesTable.name, s.name)),
        });
      }

      if (existing) {
        await db
          .update(sourcesTable)
          .set({
            name: s.name,
            url: s.url,
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

    // Disable sources removed from the registry so zombies stop crawling.
    if (keepNames.length > 0) {
      const stale = await db.query.sources.findMany({
        where: and(eq(sourcesTable.providerId, providerId), eq(sourcesTable.enabled, true)),
      });
      for (const row of stale) {
        if (!keepNames.includes(row.name) && !keepUrls.includes(row.url)) {
          await db.update(sourcesTable).set({ enabled: false }).where(eq(sourcesTable.id, row.id));
          console.log(`[seed] disabled stale source: ${p.name}/${row.name}`);
        }
      }
    }

    console.log(`[seed] ${p.name}: ${p.sources.length} source(s)`);
  }

  console.log("[seed] done");
}

await seed();
process.exit(0);
