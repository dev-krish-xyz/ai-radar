import { Hono } from "hono";
import { cors } from "hono/cors";
import { db, signals as signalsTable, events as eventsTable, eventSignals as eventSignalsTable } from "@ai-radar/db";
import { and, desc, eq } from "drizzle-orm";

const app = new Hono();
app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true }));

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
    signalCount: e.eventSignals.length,
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
