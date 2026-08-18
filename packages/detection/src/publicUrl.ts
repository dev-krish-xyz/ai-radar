/**
 * Crawl URLs are often machine endpoints (GitHub Search API, HF /api/models,
 * OpenAPI YAML, RSS). Telegram must never send those — they render as a black
 * JSON dump. Resolve a human-facing original page instead.
 */

export interface PublicUrlInput {
  crawlUrl: string;
  sourceType?: string;
  sourceName?: string;
  itemUrl?: string | null;
  modelId?: string | null;
  hfRepo?: string | null;
  repo?: string | null;
  entity?: string | null;
  paperId?: string | null;
}

const MACHINE_HOSTS = new Set([
  "api.github.com",
  "raw.githubusercontent.com",
  "registry.npmjs.org",
]);

export function isMachineUrl(url: string): boolean {
  if (!url) return true;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (MACHINE_HOSTS.has(host)) return true;
    if (host.endsWith("huggingface.co") && u.pathname.startsWith("/api/")) return true;
    if (/\.(json|ya?ml|xml|atom)$/i.test(u.pathname)) return true;
    if (/\/openapi/i.test(u.pathname)) return true;
    if (/\/(rss|feed|atom)\b/i.test(u.pathname) || /[?&]format=rss/i.test(u.search)) return true;
    if (/\/pypi\/[^/]+\/json\/?$/i.test(u.pathname)) return true;
    return false;
  } catch {
    return true;
  }
}

function firstHuman(urls: Array<string | null | undefined>): string | null {
  for (const raw of urls) {
    if (!raw) continue;
    const url = raw.trim();
    if (!/^https?:\/\//i.test(url)) continue;
    if (!isMachineUrl(url)) return url;
  }
  return null;
}

function githubHtmlFromApi(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "api.github.com") {
      const m = u.pathname.match(/^\/repos\/([^/]+)\/([^/]+)/);
      if (m) {
        const base = `https://github.com/${m[1]}/${m[2]}`;
        if (u.pathname.includes("/releases") || u.pathname.includes("/tags")) return `${base}/releases`;
        return base;
      }
      if (u.pathname.startsWith("/search/repositories")) return "https://github.com/trending";
    }
    if (u.hostname === "github.com" || u.hostname === "www.github.com") {
      if (u.pathname.includes("trending")) return "https://github.com/trending";
      const cleaned = url.replace(/\/(tags|releases|commits)\.atom$/i, "/releases").replace(/\.atom$/i, "");
      if (!isMachineUrl(cleaned)) return cleaned;
    }
    if (u.hostname === "raw.githubusercontent.com") {
      const m = u.pathname.match(/^\/([^/]+)\/([^/]+)/);
      if (m) return `https://github.com/${m[1]}/${m[2]}`;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function catalogLandingPage(crawlUrl: string, sourceName?: string): string | null {
  const blob = `${crawlUrl} ${sourceName ?? ""}`.toLowerCase();
  if (blob.includes("openai")) return "https://platform.openai.com/docs/models";
  if (blob.includes("anthropic") || blob.includes("claude")) {
    return "https://platform.claude.com/docs/en/about-claude/models/overview";
  }
  if (blob.includes("gemini") || blob.includes("google")) return "https://ai.google.dev/gemini-api/docs/models";
  if (blob.includes("x.ai") || blob.includes("xai") || blob.includes("grok")) {
    return "https://docs.x.ai/developers/models";
  }
  return null;
}

function registryPage(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "registry.npmjs.org") {
      const name = u.pathname.replace(/^\//, "");
      if (name) return `https://www.npmjs.com/package/${name}`;
    }
    const pypi = u.pathname.match(/^\/pypi\/([^/]+)\/json\/?$/i);
    if (pypi) return `https://pypi.org/project/${pypi[1]}/`;
  } catch {
    /* ignore */
  }
  return null;
}

function hfAuthorPage(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("huggingface.co")) return null;
    const author = u.searchParams.get("author") ?? u.searchParams.get("user");
    if (author) return `https://huggingface.co/${author}`;
    if (u.pathname.startsWith("/api/daily_papers")) return "https://huggingface.co/papers";
  } catch {
    /* ignore */
  }
  return null;
}

function feedLandingPage(url: string): string | null {
  try {
    const u = new URL(url);
    if (/rss\.xml$/i.test(u.pathname) || /\/(feed|atom)\b/i.test(u.pathname) || u.pathname.endsWith(".atom")) {
      const parent = u.pathname.replace(/\/?(rss\.xml|feed\/?|atom\/?|.*\.atom)$/i, "") || "/";
      return `${u.origin}${parent === "" ? "/" : parent}`;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Best human-facing URL for a Telegram "Open original source" link. */
export function resolvePublicSourceUrl(input: PublicUrlInput): string {
  const modelOrRepo =
    (input.hfRepo && input.hfRepo.includes("/") ? `https://huggingface.co/${input.hfRepo}` : null) ||
    (input.modelId && input.modelId.includes("/") ? `https://huggingface.co/${input.modelId}` : null) ||
    (input.repo ? `https://github.com/${input.repo}` : null) ||
    (input.paperId ? `https://huggingface.co/papers/${input.paperId}` : null) ||
    (input.entity && input.entity.includes("/") && !input.entity.includes(" ")
      ? `https://huggingface.co/${input.entity}`
      : null);

  const catalog = catalogLandingPage(input.crawlUrl, input.sourceName);
  const preferCatalog =
    input.sourceType === "model_catalog" || /openapi|model catalog/i.test(input.sourceName ?? "");

  const picked = firstHuman([
    input.itemUrl,
    modelOrRepo,
    preferCatalog ? catalog : null,
    githubHtmlFromApi(input.crawlUrl),
    registryPage(input.crawlUrl),
    hfAuthorPage(input.crawlUrl),
    catalog,
    feedLandingPage(input.crawlUrl),
    input.crawlUrl,
  ]);

  if (picked) return picked;

  // Last resort: never return a raw API/JSON URL.
  return catalogLandingPage(input.crawlUrl, input.sourceName) ?? "https://github.com/trending";
}

export function displayHost(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
    const shown = `${host}${path}`;
    return shown.length > 56 ? `${shown.slice(0, 53)}…` : shown;
  } catch {
    return url.slice(0, 56);
  }
}
