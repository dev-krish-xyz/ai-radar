import {
  db,
  events as eventsTable,
  eventSignals as eventSignalsTable,
  signals as signalsTable,
  sources as sourcesTable,
} from "@ai-radar/db";
import { and, desc, eq, or, gte, inArray, sql } from "drizzle-orm";
import { isAlertFresh, meetsAlertThreshold, RETENTION_MS } from "@ai-radar/shared";
import type { EventDetail, EventListItem, ProviderDetail, SignalListItem } from "./api";

function publicSourceUrl(raw: Record<string, unknown>, crawlUrl: string, entity: string | null): string {
  const pick = [raw.itemUrl, raw.url, raw.sourceUrl];
  for (const v of pick) {
    if (typeof v === "string" && /^https?:\/\//i.test(v) && !/api\.github\.com|\/api\/|openapi|\.ya?ml(\?|$)/i.test(v)) {
      return v;
    }
  }
  if (typeof raw.hfRepo === "string" && raw.hfRepo.includes("/")) return `https://huggingface.co/${raw.hfRepo}`;
  if (typeof raw.repo === "string") return `https://github.com/${raw.repo}`;
  if (typeof raw.paperId === "string") return `https://huggingface.co/papers/${raw.paperId}`;
  if (typeof raw.hnId === "string") return `https://news.ycombinator.com/item?id=${raw.hnId}`;
  if (entity?.includes("/")) return `https://huggingface.co/${entity}`;
  return crawlUrl;
}

export interface PipelineHealth {
  lastCrawlAt: string | null;
  lastCrawlAgeMinutes: number | null;
  staleWorker: boolean;
  sourcesEnabled: number;
  sourcesInError: number;
}

function toIso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

export async function getHealth(): Promise<PipelineHealth> {
  const sourcesEnabled = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sourcesTable)
    .where(eq(sourcesTable.enabled, true));
  const sourcesInError = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sourcesTable)
    .where(sql`${sourcesTable.enabled} = true AND ${sourcesTable.lastStatus} ILIKE 'error%'`);
  const last = await db
    .select({ t: sql<Date | null>`max(${sourcesTable.lastCrawledAt})` })
    .from(sourcesTable);
  const lastCrawlAt = last[0]?.t ?? null;
  const lastCrawlAgeMinutes = lastCrawlAt
    ? Math.round((Date.now() - new Date(lastCrawlAt).getTime()) / 60_000)
    : null;
  return {
    lastCrawlAt: toIso(lastCrawlAt),
    lastCrawlAgeMinutes,
    staleWorker: lastCrawlAgeMinutes !== null && lastCrawlAgeMinutes > 30,
    sourcesEnabled: sourcesEnabled[0]?.n ?? 0,
    sourcesInError: sourcesInError[0]?.n ?? 0,
  };
}

export async function listEvents(params?: {
  status?: string;
  limit?: number;
}): Promise<EventListItem[]> {
  const limit = Math.min(200, params?.limit ?? 50);
  const cutoff = new Date(Date.now() - RETENTION_MS);
  const conditions = [or(gte(eventsTable.firstDetectedAt, cutoff), eq(eventsTable.starred, true))!];
  if (params?.status) {
    conditions.push(eq(eventsTable.status, params.status as EventListItem["status"]));
  }

  const rows = await db.query.events.findMany({
    where: and(...conditions),
    orderBy: [desc(eventsTable.firstDetectedAt)],
    limit,
    with: { provider: true, eventSignals: true },
  });

  return rows.map((e) => ({
    id: e.id,
    provider: { id: e.provider.id, name: e.provider.name, slug: e.provider.slug },
    type: e.type,
    entity: e.entity,
    title: e.title,
    summary: e.summary,
    confidence: e.confidence,
    importance: e.importance,
    status: e.status,
    firstDetectedAt: toIso(e.firstDetectedAt)!,
    officiallyAnnouncedAt: toIso(e.officiallyAnnouncedAt),
    confirmedAt: toIso(e.confirmedAt),
    leadTimeMinutes: e.leadTimeMinutes,
    signalCount: e.eventSignals.length,
    alertedAt: toIso(e.alertedAt),
    starred: e.starred,
    wouldAlert:
      isAlertFresh(e.firstDetectedAt) &&
      meetsAlertThreshold(e.confidence, e.importance, { official: e.status === "CONFIRMED" }),
  }));
}

export async function getEvent(id: number): Promise<EventDetail | null> {
  const event = await db.query.events.findFirst({
    where: eq(eventsTable.id, id),
    with: { provider: true },
  });
  if (!event) return null;

  const links = await db.query.eventSignals.findMany({
    where: eq(eventSignalsTable.eventId, id),
    with: { signal: { with: { source: true } } },
  });

  const evidence = links
    .map((l) => l.signal)
    .sort((a, b) => a.detectedAt.getTime() - b.detectedAt.getTime())
    .map((s) => {
      const raw = (s.evidence ?? {}) as Record<string, unknown>;
      const publicUrl = publicSourceUrl(raw, s.source.url, s.entity);
      return {
        id: s.id,
        signalType: s.signalType,
        title: s.title,
        description: s.description,
        entity: s.entity,
        confidenceContribution: s.confidenceContribution,
        detectedAt: toIso(s.detectedAt)!,
        evidence: raw,
        source: { id: s.source.id, name: s.source.name, url: publicUrl, type: s.source.type },
      };
    });

  return {
    id: event.id,
    provider: { id: event.provider.id, name: event.provider.name, slug: event.provider.slug },
    type: event.type,
    entity: event.entity,
    title: event.title,
    summary: event.summary,
    confidence: event.confidence,
    importance: event.importance,
    status: event.status,
    firstDetectedAt: toIso(event.firstDetectedAt)!,
    officiallyAnnouncedAt: toIso(event.officiallyAnnouncedAt),
    confirmedAt: toIso(event.confirmedAt),
    leadTimeMinutes: event.leadTimeMinutes,
    alertedAt: toIso(event.alertedAt),
    starred: event.starred,
    evidence,
  };
}

export async function setEventStarred(id: number, starred: boolean): Promise<boolean> {
  const rows = await db
    .update(eventsTable)
    .set({
      starred,
      starredAt: starred ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(eventsTable.id, id))
    .returning({ id: eventsTable.id });
  return rows.length > 0;
}

export async function deleteEventById(id: number): Promise<boolean> {
  const links = await db.query.eventSignals.findMany({
    where: eq(eventSignalsTable.eventId, id),
  });
  const signalIds = links.map((l) => l.signalId);

  const rows = await db.delete(eventsTable).where(eq(eventsTable.id, id)).returning({ id: eventsTable.id });
  if (rows.length === 0) return false;

  if (signalIds.length > 0) {
    await db.delete(signalsTable).where(inArray(signalsTable.id, signalIds));
  }
  return true;
}

export async function listSignals(limit = 100): Promise<SignalListItem[]> {
  const cutoff = new Date(Date.now() - RETENTION_MS);
  const rows = await db.query.signals.findMany({
    where: gte(signalsTable.detectedAt, cutoff),
    orderBy: [desc(signalsTable.detectedAt)],
    limit: Math.min(200, limit),
    with: { provider: true, source: true },
  });
  return rows.map((s) => {
    const raw = (s.evidence ?? {}) as Record<string, unknown>;
    return {
      id: s.id,
      provider: { id: s.provider.id, name: s.provider.name, slug: s.provider.slug },
      source: {
        id: s.source.id,
        name: s.source.name,
        url: publicSourceUrl(raw, s.source.url, s.entity),
        type: s.source.type,
      },
      signalType: s.signalType,
      entity: s.entity,
      title: s.title,
      description: s.description,
      confidenceContribution: s.confidenceContribution,
      detectedAt: toIso(s.detectedAt)!,
      correlated: s.correlated,
    };
  });
}

export async function listProviders(): Promise<ProviderDetail[]> {
  const rows = await db.query.providers.findMany({
    orderBy: (p, { asc }) => [asc(p.priority), asc(p.name)],
    with: { sources: true },
  });
  return rows.map((p) => ({
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
      lastCrawledAt: toIso(s.lastCrawledAt),
      lastStatus: s.lastStatus,
    })),
  }));
}
