import * as cheerio from "cheerio";
import { extractFeedContent, isFeedContent } from "./rss";

const NOISE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "svg",
  "iframe",
  "nav",
  "footer",
  "[aria-hidden='true']",
  "link",
  "meta",
  "path",
  "img",
];

// Patterns that change on every crawl but carry zero product signal.
const NOISE_LINE_PATTERNS = [
  /^©?\s*\d{4}(\s*[-–]\s*\d{4})?\s*(openai|anthropic|google|xai|x\.ai|meta|deepseek|mistral|qwen|alibaba)?/i,
  /^all rights reserved\.?$/i,
  /^last updated:?\s*.*/i,
  /^\s*\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?\s*(utc|gmt)?\s*$/i,
];

/**
 * Extracts the meaningful textual content of an HTML page: strips scripts,
 * styles, nav/footer chrome, and other structurally-dynamic-but-content-free
 * elements, then normalizes whitespace and drops lines that are pure noise
 * (copyright years, "last updated" stamps, bare timestamps).
 */
export function extractHtmlContent(html: string): string {
  const $ = cheerio.load(html);
  $(NOISE_SELECTORS.join(",")).remove();

  const root = $("main").length ? $("main") : $("body");
  const rawText = root.text();

  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .filter((line) => !NOISE_LINE_PATTERNS.some((re) => re.test(line)));

  return lines.join("\n");
}

/**
 * Normalizes a JSON payload for stable structural hashing/diffing: parses it
 * and re-serializes with sorted keys so key-order churn never registers as a change.
 */
export function normalizeJsonContent(raw: string): string {
  const parsed = JSON.parse(raw);
  return JSON.stringify(sortKeysDeep(parsed));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return Object.fromEntries(entries.map(([k, v]) => [k, sortKeysDeep(v)]));
  }
  return value;
}

export function isJsonContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  return contentType.includes("application/json") || contentType.includes("+json");
}

/** Picks the right extraction strategy for the fetched content type. */
export function extractContent(body: string, contentType: string | null, url?: string): string {
  if (isJsonContentType(contentType)) {
    try {
      return normalizeJsonContent(body);
    } catch {
      // fall through to HTML/text extraction if the JSON fails to parse
    }
  }

  if (isFeedContent(body, contentType, url ?? "")) {
    const feed = extractFeedContent(body);
    if (feed) return feed;
  }

  return extractHtmlContent(body);
}
