import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  db,
  signals as signalsTable,
  events as eventsTable,
  eventSignals as eventSignalsTable,
  sources as sourcesTable,
  providers as providersTable,
} from "@ai-radar/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { isTelegramConfigured, meetsAlertThreshold, isAlertFresh } from "@ai-radar/shared";

const app = new Hono();
app.use("*", cors());

app.get("/health", async (c) => {
  try {
    const sourcesEnabled = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(sourcesTable)
      .where(eq(sourcesTable.enabled, true));
    const sourcesInError = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(sourcesTable)
      .where(sql`${sourcesTable.enabled} = true AND ${sourcesTable.lastStatus} ILIKE 'error%'`);
    const providersEnabled = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(providersTable)
      .where(eq(providersTable.enabled, true));
    const uncorrelated = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(signalsTable)
      .where(eq(signalsTable.correlated, false));
    const last = await db
      .select({ t: sql<Date | null>`max(${sourcesTable.lastCrawledAt})` })
      .from(sourcesTable);

    const lastCrawlAt = last[0]?.t ?? null;
    const lastCrawlAgeMinutes = lastCrawlAt
      ? Math.round((Date.now() - new Date(lastCrawlAt).getTime()) / 60_000)
      : null;

    const stale = lastCrawlAgeMinutes !== null && lastCrawlAgeMinutes > 30;
    const ok = (sourcesInError[0]?.n ?? 0) === 0 && !stale;

    return c.json({
      ok,
      telegramConfigured: isTelegramConfigured(),
      providersEnabled: providersEnabled[0]?.n ?? 0,
      sourcesEnabled: sourcesEnabled[0]?.n ?? 0,
      sourcesInError: sourcesInError[0]?.n ?? 0,
      signalsUncorrelated: uncorrelated[0]?.n ?? 0,
      lastCrawlAt,
      lastCrawlAgeMinutes,
      staleWorker: stale,
      hint: stale
        ? "Worker appears down — last crawl >30m ago. Run `bun run worker`."
        : (sourcesInError[0]?.n ?? 0) > 0
          ? "Some sources are erroring — check GET /providers lastStatus."
          : "pipeline healthy",
    });
  } catch (err) {
    return c.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        hint: "Database unreachable — run `docker compose up -d` and check DATABASE_URL",
      },
      503,
    );
  }
});

app.get("/providers", async (c) => {
  const rows = await db.query.providers.findMany({
    orderBy: (p, { asc }) => [asc(p.priority), asc(p.name)],
    with: { sources: true },
  });

  const result = rows.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    tier: p.tier,
    priority: p.priority,
    enabled: p.enabled,
    sources: p.sources.map((s) => ({
      id: s.id,
      name: s.name,
      url: s.url,
      type: s.type,
      enabled: s.enabled,
      crawlIntervalMinutes: s.crawlIntervalMinutes,
      lastCrawledAt: s.lastCrawledAt,
      lastStatus: s.lastStatus,
    })),
  }));

  return c.json(result);
});

app.get("/events", async (c) => {
  const status = c.req.query("status");
  const providerId = c.req.query("providerId");
  const limit = Math.min(200, Number(c.req.query("limit") ?? 50));

  const conditions = [];
  if (status) conditions.push(eq(eventsTable.status, status as "PRE_ANNOUNCEMENT" | "CONFIRMED" | "DISMISSED"));
  if (providerId) conditions.push(eq(eventsTable.providerId, Number(providerId)));

  const rows = await db.query.events.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: [desc(eventsTable.firstDetectedAt)],
    limit,
    with: { provider: true, eventSignals: true },
  });

  const result = rows.map((e) => ({
    id: e.id,
    provider: { id: e.provider.id, name: e.provider.name, slug: e.provider.slug },
    type: e.type,
    entity: e.entity,
    title: e.title,
    summary: e.summary,
    confidence: e.confidence,
    importance: e.importance,
    status: e.status,
    firstDetectedAt: e.firstDetectedAt,
    officiallyAnnouncedAt: e.officiallyAnnouncedAt,
    confirmedAt: e.confirmedAt,
    leadTimeMinutes: e.leadTimeMinutes,
    starred: e.starred,
    signalCount: e.eventSignals.length,
    wouldAlert:
      isAlertFresh(e.firstDetectedAt) &&
      meetsAlertThreshold(e.confidence, e.importance, {
        official: e.status === "CONFIRMED",
      }),
  }));

  return c.json(result);
});

app.get("/events/:id", async (c) => {
  const id = Number(c.req.param("id"));

  const event = await db.query.events.findFirst({
    where: eq(eventsTable.id, id),
    with: { provider: true },
  });
  if (!event) return c.json({ error: "not found" }, 404);

  const links = await db.query.eventSignals.findMany({
    where: eq(eventSignalsTable.eventId, id),
    with: { signal: { with: { source: true } } },
  });

  const evidence = links
    .map((l) => l.signal)
    .sort((a, b) => a.detectedAt.getTime() - b.detectedAt.getTime())
    .map((s) => ({
      id: s.id,
      signalType: s.signalType,
      title: s.title,
      description: s.description,
      entity: s.entity,
      confidenceContribution: s.confidenceContribution,
      detectedAt: s.detectedAt,
      evidence: s.evidence,
      source: { id: s.source.id, name: s.source.name, url: s.source.url, type: s.source.type },
    }));

  return c.json({
    id: event.id,
    provider: { id: event.provider.id, name: event.provider.name, slug: event.provider.slug },
    type: event.type,
    entity: event.entity,
    title: event.title,
    summary: event.summary,
    confidence: event.confidence,
    importance: event.importance,
    status: event.status,
    firstDetectedAt: event.firstDetectedAt,
    officiallyAnnouncedAt: event.officiallyAnnouncedAt,
    confirmedAt: event.confirmedAt,
    leadTimeMinutes: event.leadTimeMinutes,
    alertedAt: event.alertedAt,
    evidence,
  });
});

app.get("/signals", async (c) => {
  const providerId = c.req.query("providerId");
  const limit = Math.min(200, Number(c.req.query("limit") ?? 100));

  const rows = await db.query.signals.findMany({
    where: providerId ? eq(signalsTable.providerId, Number(providerId)) : undefined,
    orderBy: [desc(signalsTable.detectedAt)],
    limit,
    with: { provider: true, source: true },
  });

  const result = rows.map((s) => ({
    id: s.id,
    provider: { id: s.provider.id, name: s.provider.name, slug: s.provider.slug },
    source: { id: s.source.id, name: s.source.name, url: s.source.url, type: s.source.type },
    signalType: s.signalType,
    entity: s.entity,
    title: s.title,
    description: s.description,
    confidenceContribution: s.confidenceContribution,
    detectedAt: s.detectedAt,
    correlated: s.correlated,
  }));

  return c.json(result);
});

const port = Number(process.env.PORT ?? 8787);
console.log(`[api] listening on :${port}`);

export default {
  port,
  fetch: app.fetch,
};
