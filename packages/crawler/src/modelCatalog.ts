/**
 * Normalize a model catalog page / OpenAPI spec / already-structured JSON
 * into a stable { latest, count, models[] } payload for set-diff detection.
 */

const MODEL_ID_RE =
  /\b((?:gpt|o[134]|claude|gemini|grok|llama|Llama|deepseek|DeepSeek|mistral|qwen|Qwen)[-.]?[A-Za-z0-9][A-Za-z0-9._-]{1,80})\b/g;

const NOISE = new Set([
  "gpt-4",
  "gpt-3",
  "llama-2",
  "claude-2",
  "gemini-pro",
]);

export function normalizeModelIdList(ids: string[]): string {
  const unique = [...new Set(ids.map((s) => s.trim()).filter(Boolean))];
  const sorted = [...unique].sort((a, b) => a.localeCompare(b));
  return JSON.stringify({
    latest: unique[0] ?? null,
    count: sorted.length,
    models: sorted,
  });
}

function isJunkModelId(id: string): boolean {
  if (NOISE.has(id)) return true;
  if (/\.(png|jpg|jpeg|gif|svg|webp|css|js|map|json)$/i.test(id)) return true;
  if (/-and-/i.test(id)) return true;
  if (/\.(com|dev|io|ai)$/i.test(id)) return true;
  // UI chrome, not a model slug
  if (/^(claude-code|claude-plugin|claude-api-skill|claude-code-analytics-api|gemini-api|claude\.com)$/i.test(id)) {
    return true;
  }
  return false;
}

function collectFromText(text: string): string[] {
  const found = new Set<string>();
  MODEL_ID_RE.lastIndex = 0;
  for (const m of text.matchAll(MODEL_ID_RE)) {
    const id = m[1]!;
    if (id.length < 5 || id.length > 80) continue;
    const clean = id.replace(/[.,;:)]+$/, "");
    if (isJunkModelId(clean)) continue;
    found.add(clean);
  }
  return [...found];
}

function extractFromStructuredJson(body: string): string[] | null {
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const rec = parsed as Record<string, unknown>;
      if (Array.isArray(rec.models) && rec.models.every((x) => typeof x === "string")) {
        return rec.models as string[];
      }
    }
    if (Array.isArray(parsed)) {
      const ids = parsed
        .map((row) => {
          if (typeof row === "string") return row;
          if (row && typeof row === "object") {
            const r = row as Record<string, unknown>;
            if (typeof r.id === "string") return r.id;
            if (typeof r.modelId === "string") return r.modelId;
            if (typeof r.name === "string") return r.name;
          }
          return null;
        })
        .filter((x): x is string => Boolean(x));
      if (ids.length > 0) return ids;
    }
    return null;
  } catch {
    return null;
  }
}

/** Pull model-like slugs from OpenAPI YAML/JSON without keeping the whole spec. */
function extractFromOpenApi(body: string): string[] {
  return collectFromText(body);
}

/**
 * Best-effort catalog extract. Returns normalized JSON or null if too few IDs
 * (caller should fall back to HTML extract).
 */
export function extractModelCatalog(body: string, contentType: string | null, url: string): string | null {
  const ct = (contentType ?? "").toLowerCase();
  const looksYaml = url.endsWith(".yaml") || url.endsWith(".yml") || ct.includes("yaml");

  if (!looksYaml) {
    const structured = extractFromStructuredJson(body);
    if (structured && structured.length >= 2) {
      return normalizeModelIdList(structured);
    }
  }

  const fromText = looksYaml ? extractFromOpenApi(body) : collectFromText(body);
  if (fromText.length < 2) return null;
  return normalizeModelIdList(fromText);
}

export function isStructuredModelCatalog(content: string): boolean {
  const t = content.trimStart();
  return t.startsWith("{") && t.includes('"models"') && t.includes('"count"');
}
