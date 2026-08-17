import { env } from "@ai-radar/shared";

const AI_REPO_RE =
  /\b(llm|large language|coding agent|ai agent|mcp\b|vllm|ollama|langchain|llamaindex|finetun|inference|transformer|huggingface|claude|gemini|openai|anthropic|grok|codex|whisper|diffusion|lora|gguf|rag\b|agentic|autogen|crewai|dspy)\b/i;

const NOT_AI_RE = /\b(nft|crypto wallet|memecoin|airdrop|tokenomics|forex signal)\b/i;

export function looksLikeAiRepo(name: string, description: string): boolean {
  const blob = `${name} ${description}`;
  if (NOT_AI_RE.test(blob)) return false;
  return AI_REPO_RE.test(blob);
}

export interface DiscoveredRepo {
  fullName: string;
  stars: number;
  description: string;
  url: string;
}

export function normalizeRepoList(repos: DiscoveredRepo[]): string {
  const names = repos.map((r) => r.fullName).sort((a, b) => a.localeCompare(b));
  return JSON.stringify({
    count: names.length,
    repos: names,
    details: Object.fromEntries(
      repos.map((r) => [r.fullName, { stars: r.stars, description: r.description.slice(0, 180), url: r.url }]),
    ),
  });
}

/** Rising repos: created in the last 7 days, already attracting stars. */
export function buildRisingReposSearchUrl(now: Date = new Date()): string {
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60_000).toISOString().slice(0, 10);
  // No parentheses — GitHub Search returns 422 on grouped OR + qualifier.
  const q = `llm OR mcp OR vllm OR ollama OR grok OR rag created:>${since} stars:>=30`;
  const url = new URL("https://api.github.com/search/repositories");
  url.searchParams.set("q", q);
  url.searchParams.set("sort", "stars");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", "20");
  return url.toString();
}

export function isGithubSearchUrl(url: string): boolean {
  return url.includes("api.github.com/search/repositories") || url.includes("github.com/search?");
}

export function isGithubTrendingUrl(url: string): boolean {
  return /github\.com\/trending/.test(url);
}

export function extractGithubSearchRepos(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { items?: unknown };
    if (!Array.isArray(parsed.items)) return null;
    const repos: DiscoveredRepo[] = [];
    for (const raw of parsed.items) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const fullName = typeof r.full_name === "string" ? r.full_name : "";
      if (!fullName) continue;
      const description = typeof r.description === "string" ? r.description : "";
      if (!looksLikeAiRepo(fullName, description)) continue;
      repos.push({
        fullName,
        stars: typeof r.stargazers_count === "number" ? r.stargazers_count : 0,
        description,
        url: typeof r.html_url === "string" ? r.html_url : `https://github.com/${fullName}`,
      });
    }
    return normalizeRepoList(repos);
  } catch {
    return null;
  }
}

/** Parse github.com/trending HTML for owner/repo + description. */
export function extractGithubTrendingRepos(html: string): string | null {
  const repos: DiscoveredRepo[] = [];
  const seen = new Set<string>();
  // Trending cards: <h2 ...><a href="/owner/repo">
  const linkRe = /<h2[^>]*>\s*<a[^>]+href="\/([^"/]+)\/([^"/]+)"/gi;
  for (const m of html.matchAll(linkRe)) {
    const fullName = `${m[1]}/${m[2]}`;
    if (seen.has(fullName)) continue;
    seen.add(fullName);
    repos.push({
      fullName,
      stars: 0,
      description: "",
      url: `https://github.com/${fullName}`,
    });
  }

  // Descriptions sit in <p class="col-9 ..."> near each card — best-effort.
  const descBlocks = html.match(/<p class="col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/gi) ?? [];
  for (let i = 0; i < Math.min(repos.length, descBlocks.length); i++) {
    const text = descBlocks[i]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    repos[i]!.description = text.slice(0, 180);
  }

  const aiOnly = repos.filter((r) => looksLikeAiRepo(r.fullName, r.description));
  if (aiOnly.length === 0 && repos.length === 0) return null;
  return normalizeRepoList(aiOnly);
}

export function githubSearchAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  };
  if (env.githubToken) headers.authorization = `Bearer ${env.githubToken}`;
  return headers;
}
