import type { ProviderTier, SourceType } from "@ai-radar/shared";

/**
 * Crawl cadence (minutes). Tuned for early detection:
 * catalogs/changelogs/blogs first (where model launches surface), then GitHub/SDK,
 * pricing slowest (changes rarely and is noisier).
 */
export const CRAWL_INTERVALS: Record<SourceType, number> = {
  model_catalog: 5,
  api_reference: 5,
  changelog: 5,
  blog: 5,
  product_page: 10,
  docs: 10,
  github_repo: 10,
  github_releases: 10,
  sdk_npm: 10,
  sdk_pypi: 10,
  pricing: 30,
  social: 5,
};

export interface SourceConfig {
  name: string;
  url: string;
  type: SourceType;
  /** overrides the SourceType default cadence when the source needs its own pace */
  crawlIntervalMinutes?: number;
  enabled?: boolean;
}

export interface ProviderConfig {
  slug: string;
  name: string;
  tier: ProviderTier;
  /** lower = crawled/weighted with more urgency; tier1 providers use 1-10, tier2 use 50+ */
  priority: number;
  enabled: boolean;
  sources: SourceConfig[];
}
