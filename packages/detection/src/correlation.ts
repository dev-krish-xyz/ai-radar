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

/**
 * Finds an existing open event this signal should be grouped into (same provider,
 * within the time-proximity window, and matching by entity or semantic similarity).
 * Returns null when the signal should seed a brand-new event instead.
 */
export function findMatchingEvent(
  signal: Pick<SignalRecord, "entity" | "title" | "description" | "detectedAt">,
  providerId: number,
  candidateEvents: EventRecord[],
  now: Date = new Date(),
): EventRecord | null {
  const open = candidateEvents.filter(
    (e) =>
      e.providerId === providerId &&
      e.status === "PRE_ANNOUNCEMENT" &&
      now.getTime() - e.updatedAt.getTime() <= CORRELATION_WINDOW_MS &&
      now.getTime() - e.firstDetectedAt.getTime() <= MAX_EVENT_OPEN_MS,
  );
  if (open.length === 0) return null;

  if (signal.entity) {
    const entityMatch = open
      .filter((e) => e.entity && e.entity.toLowerCase() === signal.entity!.toLowerCase())
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
    if (entityMatch) return entityMatch;
  }

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
export function isAnnouncementSource(sourceType: string): boolean {
  return ANNOUNCEMENT_SOURCE_TYPES.has(sourceType);
}

export function computeLeadTimeMinutes(firstDetectedAt: Date, announcedAt: Date): number {
  return Math.max(0, Math.round((announcedAt.getTime() - firstDetectedAt.getTime()) / 60_000));
}
