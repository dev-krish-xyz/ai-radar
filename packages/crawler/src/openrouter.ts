export function isOpenRouterModelsUrl(url: string): boolean {
  return /openrouter\.ai\/api\/v1\/models/.test(url);
}

/** Normalize OpenRouter `/api/v1/models` into the catalog `{ count, models[] }` shape. */
export function extractOpenRouterModels(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { data?: unknown };
    const rows = Array.isArray(parsed.data) ? parsed.data : Array.isArray(parsed) ? parsed : null;
    if (!rows) return null;
    const ids: string[] = [];
    for (const raw of rows) {
      if (!raw || typeof raw !== "object") continue;
      const id = (raw as { id?: unknown }).id;
      if (typeof id === "string" && id.length > 2) ids.push(id);
    }
    if (ids.length < 2) return null;
    const unique = [...new Set(ids)];
    const newestFirst = unique;
    const sorted = [...unique].sort((a, b) => a.localeCompare(b));
    return JSON.stringify({
      latest: newestFirst[0] ?? null,
      count: sorted.length,
      models: sorted,
    });
  } catch {
    return null;
  }
}
