import { env } from "@ai-radar/shared";
import { waitForHostSlot } from "./rateLimiter";

export interface FetchOptions {
  etag?: string | null;
  lastModified?: string | null;
  timeoutMs?: number;
  retries?: number;
}

export interface FetchResult {
  ok: boolean;
  notModified: boolean;
  status: number;
  body: string | null;
  contentType: string | null;
  etag: string | null;
  lastModified: string | null;
  error: string | null;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches a source with ETag/Last-Modified revalidation, timeout, retry-with-backoff,
 * and per-host rate limiting. Never throws — callers get a result object so a single
 * flaky source can't crash the crawl loop.
 */
export async function fetchSource(url: string, options: FetchOptions = {}): Promise<FetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;

  let lastError: string | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    await waitForHostSlot(url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers: Record<string, string> = {
        "user-agent": env.crawlerUserAgent,
        accept: "text/html,application/json,application/xhtml+xml,*/*;q=0.8",
      };
      if (options.etag) headers["if-none-match"] = options.etag;
      if (options.lastModified) headers["if-modified-since"] = options.lastModified;

      const res = await fetch(url, { headers, redirect: "follow", signal: controller.signal });
      clearTimeout(timeout);

      if (res.status === 304) {
        return {
          ok: true,
          notModified: true,
          status: 304,
          body: null,
          contentType: null,
          etag: options.etag ?? null,
          lastModified: options.lastModified ?? null,
          error: null,
        };
      }

      const body = await res.text();

      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        // Retry on 5xx / 429, don't retry on 4xx (won't succeed without changing the request)
        if (res.status >= 500 || res.status === 429) {
          await sleep(backoffMs(attempt));
          continue;
        }
        return {
          ok: false,
          notModified: false,
          status: res.status,
          body: null,
          contentType: res.headers.get("content-type"),
          etag: res.headers.get("etag"),
          lastModified: res.headers.get("last-modified"),
          error: lastError,
        };
      }

      return {
        ok: true,
        notModified: false,
        status: res.status,
        body,
        contentType: res.headers.get("content-type"),
        etag: res.headers.get("etag"),
        lastModified: res.headers.get("last-modified"),
        error: null,
      };
    } catch (err) {
      clearTimeout(timeout);
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < retries) {
        await sleep(backoffMs(attempt));
        continue;
      }
    }
  }

  return {
    ok: false,
    notModified: false,
    status: 0,
    body: null,
    contentType: null,
    etag: null,
    lastModified: null,
    error: lastError ?? "unknown fetch error",
  };
}

function backoffMs(attempt: number): number {
  return 500 * 2 ** attempt + Math.floor(Math.random() * 250);
}
