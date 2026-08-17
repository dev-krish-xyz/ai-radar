import { env } from "@ai-radar/shared";

export interface GithubRepoRef {
  owner: string;
  repo: string;
}

/**
 * Pulls owner/repo from any common GitHub URL shape:
 *   https://github.com/openai/openai-python/releases
 *   https://github.com/openai/openai-python/tags.atom
 *   https://api.github.com/repos/openai/openai-python/tags?per_page=20
 */
export function parseGithubRepo(url: string): GithubRepoRef | null {
  try {
    const u = new URL(url);
    if (u.hostname === "api.github.com") {
      const m = u.pathname.match(/^\/repos\/([^/]+)\/([^/]+)/);
      if (!m) return null;
      return { owner: m[1]!, repo: m[2]!.replace(/\.git$/, "") };
    }
    if (u.hostname === "github.com" || u.hostname === "www.github.com") {
      const m = u.pathname.match(/^\/([^/]+)\/([^/]+)/);
      if (!m) return null;
      return { owner: m[1]!, repo: m[2]!.replace(/\.git$/, "") };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Prefer the authenticated API when a token is set (5k req/hr).
 * github_repo → recent commits (codename watch).
 * github_releases → tags (version watch).
 */
export function resolveGithubFetchUrl(sourceUrl: string, sourceType?: string): string {
  // Discovery URLs are not a single repo — never rewrite to tags/commits.
  if (sourceUrl.includes("/search/repositories") || sourceUrl.includes("github.com/trending")) {
    return sourceUrl;
  }
  const ref = parseGithubRepo(sourceUrl);
  if (!ref) return sourceUrl;

  const wantCommits = sourceType === "github_repo";
  if (env.githubToken) {
    return wantCommits
      ? `https://api.github.com/repos/${ref.owner}/${ref.repo}/commits?per_page=20`
      : `https://api.github.com/repos/${ref.owner}/${ref.repo}/tags?per_page=30`;
  }
  return wantCommits
    ? `https://github.com/${ref.owner}/${ref.repo}/commits.atom`
    : `https://github.com/${ref.owner}/${ref.repo}/tags.atom`;
}

export function isGithubSourceType(type: string): boolean {
  return type === "github_releases" || type === "github_repo";
}

/** Stable, noise-free representation of a tag list for hashing and diffing. */
export function normalizeGithubTagsList(tagNames: string[]): string {
  // Preserve API/feed order (newest first). Only the set + latest matter for signals,
  // but order stability avoids false diffs when nothing changed.
  const cleaned = tagNames.map((t) => t.trim()).filter(Boolean);
  const latest = cleaned[0] ?? null;
  return JSON.stringify({ latest, tags: cleaned });
}

/** Parses GitHub Tags API JSON (`[{ name, commit, ... }, ...]`) into normalized content. */
export function extractGithubApiTags(body: string): string | null {
  try {
    const parsed = JSON.parse(body);
    if (!Array.isArray(parsed)) return null;
    const names = parsed
      .map((t) => (t && typeof t === "object" && typeof (t as { name?: unknown }).name === "string" ? (t as { name: string }).name : null))
      .filter((n): n is string => n !== null);
    return normalizeGithubTagsList(names);
  } catch {
    return null;
  }
}

/** Parses GitHub tags.atom / releases.atom into the same normalized shape. */
export function extractGithubAtomTags(body: string): string | null {
  // Only treat as Atom if it looks like a feed — empty feeds (no tags) are valid.
  if (!/<feed\b/i.test(body) && !body.includes("http://www.w3.org/2005/Atom")) {
    return null;
  }
  // Prefer <entry><title>…</title> over feed-level <title>
  const entryBlocks = body.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  const names: string[] = [];
  for (const entry of entryBlocks) {
    const m = entry.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (m?.[1]) names.push(decodeXmlEntities(m[1].trim()));
  }
  return normalizeGithubTagsList(names);
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Best-effort extract for any GitHub tags/releases payload (API JSON, Atom, or HTML fallback).
 * Returns null when the body is not a recognized GitHub tags payload — caller should fall back.
 */
export function extractGithubReleaseContent(body: string, contentType: string | null, url: string): string | null {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("json") || url.includes("api.github.com")) {
    const fromApi = extractGithubApiTags(body);
    if (fromApi) return fromApi;
  }
  if (ct.includes("atom") || ct.includes("xml") || url.endsWith(".atom") || body.includes("<feed")) {
    const fromAtom = extractGithubAtomTags(body);
    if (fromAtom) return fromAtom;
  }
  return null;
}

export function normalizeGithubCommitMessages(messages: string[]): string {
  const cleaned = messages.map((m) => m.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 20);
  return JSON.stringify({
    latest: cleaned[0] ?? null,
    count: cleaned.length,
    commits: cleaned,
  });
}

export function extractGithubApiCommits(body: string): string | null {
  try {
    const parsed = JSON.parse(body);
    if (!Array.isArray(parsed)) return null;
    const messages = parsed
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const msg = (row as { commit?: { message?: unknown } }).commit?.message;
        return typeof msg === "string" ? msg.split("\n")[0]!.trim() : null;
      })
      .filter((m): m is string => Boolean(m));
    return normalizeGithubCommitMessages(messages);
  } catch {
    return null;
  }
}

/** commits.atom titles = first line of commit message. */
export function extractGithubAtomCommits(body: string): string | null {
  if (!/<feed\b/i.test(body) && !body.includes("http://www.w3.org/2005/Atom")) return null;
  const entryBlocks = body.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  const messages: string[] = [];
  for (const entry of entryBlocks) {
    const m = entry.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (m?.[1]) messages.push(decodeXmlEntities(m[1].trim()));
  }
  return normalizeGithubCommitMessages(messages);
}

export function extractGithubRepoContent(body: string, contentType: string | null, url: string): string | null {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("json") || url.includes("/commits")) {
    const fromApi = extractGithubApiCommits(body);
    if (fromApi) return fromApi;
  }
  if (ct.includes("atom") || ct.includes("xml") || url.endsWith(".atom") || body.includes("<feed")) {
    const fromAtom = extractGithubAtomCommits(body);
    if (fromAtom) return fromAtom;
  }
  return null;
}
