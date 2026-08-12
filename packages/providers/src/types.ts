import type { ProviderTier, SourceType } from "@ai-radar/shared";

/** Crawl cadence bands per the spec: registries fastest, pricing slowest. */
export const CRAWL_INTERVALS: Record<SourceType, number> = {
  model_catalog: 12,
  api_reference: 12,
  docs: 30,
  changelog: 30,
  blog: 30,
  product_page: 30,
  github_repo: 45,
  github_releases: 45,
  sdk_npm: 45,
  sdk_pypi: 45,
  pricing: 90,
  social: 60,
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
