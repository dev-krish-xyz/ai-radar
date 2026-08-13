import type { ProviderTier, SourceType } from "@ai-radar/shared";

/** Crawl cadence bands per the spec: registries fastest, pricing slowest. */
export const CRAWL_INTERVALS: Record<SourceType, number> = {
  model_catalog: 10,
  api_reference: 10,
  docs: 15,
  changelog: 15,
  blog: 15,
  product_page: 15,
  github_repo: 20,
  github_releases: 20,
  sdk_npm: 20,
  sdk_pypi: 20,
  pricing: 60,
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
