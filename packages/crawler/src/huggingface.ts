/**
 * Hugging Face org/user model catalogs via the public API.
 * HTML org pages churn on follower counts and "recent activity" — the API is stable.
 */

export interface HfModelRef {
  id: string;
  createdAt: string | null;
  likes: number | null;
  downloads: number | null;
  pipelineTag: string | null;
}

/** Match https://huggingface.co/{org} or /api/models?author=... */
export function parseHfAuthor(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("huggingface.co")) return null;

    if (u.pathname.startsWith("/api/models")) {
      const author = u.searchParams.get("author") ?? u.searchParams.get("user");
      return author && author.length > 0 ? author : null;
    }

    // /meta-llama, /Qwen, /deepseek-ai — single path segment, not /models/...
    const m = u.pathname.match(/^\/([A-Za-z0-9_.-]+)\/?$/);
    if (m?.[1] && !["api", "docs", "blog", "datasets", "spaces", "login", "join"].includes(m[1])) {
      return m[1];
    }
    return null;
  } catch {
    return null;
  }
}

export function isHuggingFaceSource(url: string, sourceName?: string): boolean {
  if (url.includes("huggingface.co")) return true;
  if (sourceName && /hugging\s*face/i.test(sourceName)) return true;
  return false;
}

/**
 * Prefer the structured models API. Sorted by creation date (newest first).
 * limit=40 keeps the payload small while still catching bursts of releases.
 */
export function resolveHfFetchUrl(sourceUrl: string): string {
  // Never rewrite blog/feed/docs URLs into the models API.
  if (/\/(blog|docs|datasets|spaces|learn)\b/i.test(sourceUrl) || /\.(xml|atom)$/i.test(sourceUrl)) {
    return sourceUrl;
  }
  const author = parseHfAuthor(sourceUrl);
  if (!author) return sourceUrl;
  if (sourceUrl.includes("/api/models")) return sourceUrl;
  return `https://huggingface.co/api/models?author=${encodeURIComponent(author)}&sort=createdAt&direction=-1&limit=40`;
}

export function normalizeHfModelsList(models: HfModelRef[]): string {
  // Sort ids for set-equality of membership; also keep newest-first order for "latest".
  const idsNewestFirst = models.map((m) => m.id).filter(Boolean);
  const idsSorted = [...idsNewestFirst].sort((a, b) => a.localeCompare(b));
  return JSON.stringify({
    latest: idsNewestFirst[0] ?? null,
    count: idsSorted.length,
    models: idsSorted,
    // Keep a short newest window for line-diff friendly signal extraction
    recent: idsNewestFirst.slice(0, 15),
  });
}

export function extractHfApiModels(body: string): string | null {
  try {
    const parsed = JSON.parse(body);
    if (!Array.isArray(parsed)) return null;

    const models: HfModelRef[] = parsed.map((row) => {
      const r = row as Record<string, unknown>;
      const id = typeof r.id === "string" ? r.id : typeof r.modelId === "string" ? r.modelId : "";
      return {
        id,
        createdAt: typeof r.createdAt === "string" ? r.createdAt : null,
        likes: typeof r.likes === "number" ? r.likes : null,
        downloads: typeof r.downloads === "number" ? r.downloads : null,
        pipelineTag: typeof r.pipeline_tag === "string" ? r.pipeline_tag : null,
      };
    }).filter((m) => m.id.length > 0);

    return normalizeHfModelsList(models);
  } catch {
    return null;
  }
}

/** Best-effort: API JSON, else null (caller falls back to HTML extract). */
export function extractHfContent(body: string, contentType: string | null, url: string): string | null {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("json") || url.includes("/api/models") || body.trimStart().startsWith("[")) {
    return extractHfApiModels(body);
  }
  return null;
}
