/** Persistent-alert fingerprints. Stored in `alert_fingerprints` so restarts still suppress dupes. */

export type FingerprintKind = "url" | "title" | "entity" | "story";

export interface AlertFingerprint {
  fingerprint: string;
  kind: FingerprintKind;
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|ref|fbclid|gclid|mc_cid|mc_eid)/i.test(key)) u.searchParams.delete(key);
    }
    let path = u.pathname.replace(/\/+$/, "") || "/";
    path = path.replace(/\.git$/i, "");
    const qs = u.searchParams.toString();
    return `${u.protocol}//${u.hostname}${path}${qs ? `?${qs}` : ""}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

const TITLE_NOISE =
  /^(possible\s+)?(new\s+)?(model|product|preview|feed|update)s?\s*[:—-]\s*/i;

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/^[^—]+—\s*/, "")
    .replace(TITLE_NOISE, "")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeEntity(entity: string): string {
  const t = entity.trim().toLowerCase();
  const tail = t.includes("/") ? t.slice(t.lastIndexOf("/") + 1) : t;
  return tail.replace(/[^a-z0-9.-]+/g, "");
}

const STORY_STOP = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "is",
  "new",
  "possible",
  "model",
  "detected",
  "change",
  "feed",
  "repo",
  "rising",
  "daily",
  "paper",
  "huggingface",
  "github",
]);

function storyKey(title: string, entity: string | null): string | null {
  const tokens = `${entity ?? ""} ${title}`
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter((t) => t.length > 2 && !STORY_STOP.has(t));
  const uniq = [...new Set(tokens)].sort();
  if (uniq.length < 2) return null;
  return uniq.slice(0, 6).join(" ");
}

export function buildAlertFingerprints(input: {
  publicUrl: string;
  title: string;
  entity: string | null;
  providerName: string;
}): AlertFingerprint[] {
  const out: AlertFingerprint[] = [];

  if (input.publicUrl) {
    out.push({ fingerprint: `url:${normalizeUrl(input.publicUrl)}`, kind: "url" });
  }

  const title = normalizeTitle(input.title);
  if (title.length >= 8) {
    out.push({ fingerprint: `title:${title}`, kind: "title" });
  }

  if (input.entity) {
    const ent = normalizeEntity(input.entity);
    if (ent.length >= 4) {
      out.push({ fingerprint: `entity:${ent}`, kind: "entity" });
    }
  }

  const story = storyKey(input.title, input.entity);
  if (story) {
    out.push({ fingerprint: `story:${story}`, kind: "story" });
  }

  return out;
}
