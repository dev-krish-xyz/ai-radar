import type { EventRecord, SignalRecord } from "./types";
import { ANNOUNCEMENT_SOURCE_TYPES } from "./patterns";

/** "Time proximity" window from the spec: a signal can join an event's cluster this long after the event's last activity. */
export const CORRELATION_WINDOW_MS = 6 * 60 * 60 * 1000;
/** Hard ceiling so a stale PRE_ANNOUNCEMENT event can't keep absorbing signals forever. */
export const MAX_EVENT_OPEN_MS = 72 * 60 * 60 * 1000;

const SIMILARITY_THRESHOLD = 0.2;
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is", "are",
  "was", "were", "be", "new", "detected", "change", "changed",
]);

/** Match `Qwen/Qwen3.8-27B` to `Qwen3.8-27B` so HF + catalog don't fork events. */
function entitiesMatch(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return true;
  const tail = (s: string) => (s.includes("/") ? s.slice(s.lastIndexOf("/") + 1) : s);
  const tx = tail(x);
  const ty = tail(y);
  return tx.length >= 5 && tx === ty;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9.]+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export const CROSS_PROVIDER_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Finds an existing open event this signal should be grouped into (same provider,
 * within the time-proximity window, and matching by entity or semantic similarity).
 * When `crossProvider` is set, a strong entity match can join another provider's
 * story so catalog + HN + news become one event.
 */
export function findMatchingEvent(
  signal: Pick<SignalRecord, "entity" | "title" | "description" | "detectedAt">,
  providerId: number,
  candidateEvents: EventRecord[],
  now: Date = new Date(),
  opts: { crossProvider?: boolean } = {},
): EventRecord | null {
  const sameProvider = candidateEvents.filter(
    (e) =>
      e.providerId === providerId &&
      e.status === "PRE_ANNOUNCEMENT" &&
      now.getTime() - e.updatedAt.getTime() <= CORRELATION_WINDOW_MS &&
      now.getTime() - e.firstDetectedAt.getTime() <= MAX_EVENT_OPEN_MS,
  );

  const tryEntity = (pool: EventRecord[]): EventRecord | undefined => {
    if (!signal.entity) return undefined;
    return pool
      .filter((e) => e.entity && entitiesMatch(e.entity, signal.entity!))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
  };

  const localEntity = tryEntity(sameProvider);
  if (localEntity) return localEntity;

  if (opts.crossProvider && signal.entity && signal.entity.replace(/[^a-z0-9]/gi, "").length >= 5) {
    const cross = candidateEvents.filter(
      (e) =>
        e.providerId !== providerId &&
        (e.status === "PRE_ANNOUNCEMENT" || e.status === "CONFIRMED") &&
        now.getTime() - e.firstDetectedAt.getTime() <= CROSS_PROVIDER_WINDOW_MS,
    );
    const hit = tryEntity(cross);
    if (hit) return hit;
  }

  const open = sameProvider;
  if (open.length === 0) return null;

  const signalTokens = tokenize(`${signal.title} ${signal.description}`);
  let best: { event: EventRecord; score: number } | null = null;
  for (const event of open) {
    const eventTokens = tokenize(`${event.title} ${event.summary}`);
    const score = jaccardSimilarity(signalTokens, eventTokens);
    if (score >= SIMILARITY_THRESHOLD && (!best || score > best.score)) {
      best = { event, score };
    }
  }
  return best?.event ?? null;
}

/** Official-announcement channels are the only ones that flip PRE_ANNOUNCEMENT -> CONFIRMED. */
export function isAnnouncementSource(sourceType: string, sourceUrl?: string): boolean {
  if (!ANNOUNCEMENT_SOURCE_TYPES.has(sourceType)) return false;
  if (sourceUrl && (/api\.github\.com\/search/i.test(sourceUrl) || /github\.com\/trending/i.test(sourceUrl))) {
    return false;
  }
  return true;
}

export function computeLeadTimeMinutes(firstDetectedAt: Date, announcedAt: Date): number {
  return Math.max(0, Math.round((announcedAt.getTime() - firstDetectedAt.getTime()) / 60_000));
}
