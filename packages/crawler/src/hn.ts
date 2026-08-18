const HN_AI =
  /\b(openai|anthropic|claude|gemini|google|grok|xai|x\.ai|llama|mistral|deepseek|qwen|llm|gpt-?\d|codex|mcp|vllm|agentic|foundation model)\b/i;

export function isHnSearchUrl(url: string): boolean {
  return url.includes("hn.algolia.com");
}

/** Last 4 hours, scored stories only. */
export function buildHnRecentUrl(now: Date = new Date()): string {
  const since = Math.floor((now.getTime() - 4 * 60 * 60_000) / 1000);
  const q = "OpenAI OR Anthropic OR Gemini OR Grok OR Claude OR LLM OR Codex";
  const filters = `created_at_i>${since},points>=15`;
  const url = new URL("https://hn.algolia.com/api/v1/search_by_date");
  url.searchParams.set("query", q);
  url.searchParams.set("tags", "story");
  url.searchParams.set("numericFilters", filters);
  url.searchParams.set("hitsPerPage", "20");
  return url.toString();
}

export interface HnStory {
  id: string;
  title: string;
  url: string;
  points: number;
}

export function extractHnStories(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { hits?: unknown };
    if (!Array.isArray(parsed.hits)) return null;
    const stories: HnStory[] = [];
    for (const raw of parsed.hits) {
      if (!raw || typeof raw !== "object") continue;
      const h = raw as Record<string, unknown>;
      const title = typeof h.title === "string" ? h.title : "";
      if (!title || !HN_AI.test(title)) continue;
      const objectId = h.objectID != null ? String(h.objectID) : "";
      if (!objectId) continue;
      const ext = typeof h.url === "string" && h.url.startsWith("http") ? h.url : "";
      stories.push({
        id: objectId,
        title,
        url: ext || `https://news.ycombinator.com/item?id=${objectId}`,
        points: typeof h.points === "number" ? h.points : 0,
      });
    }
    const ids = stories.map((s) => s.id).sort((a, b) => a.localeCompare(b));
    return JSON.stringify({
      count: ids.length,
      stories: ids,
      details: Object.fromEntries(stories.map((s) => [s.id, { title: s.title.slice(0, 200), url: s.url, points: s.points }])),
    });
  } catch {
    return null;
  }
}
