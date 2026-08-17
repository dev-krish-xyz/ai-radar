export const PROVIDER_TIERS = ["tier1", "tier2"] as const;
export type ProviderTier = (typeof PROVIDER_TIERS)[number];

export const SOURCE_TYPES = [
  "blog",
  "docs",
  "changelog",
  "model_catalog",
  "api_reference",
  "pricing",
  "github_repo",
  "github_releases",
  "sdk_npm",
  "sdk_pypi",
  "product_page",
  "social",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SIGNAL_TYPES = [
  "new_model_id",
  "new_endpoint",
  "sdk_change",
  "doc_change",
  "pricing_change",
  "model_catalog_change",
  "github_release",
  "capability_change",
  "availability_change",
  "deprecation",
  "product_launch",
  "other",
] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];

export const EVENT_TYPES = [
  "MODEL_LAUNCH",
  "MODEL_PREVIEW",
  "AVAILABILITY_CHANGE",
  "CAPABILITY_CHANGE",
  "NEW_ENDPOINT",
  "API_CHANGE",
  "DEV_FEATURE",
  "PRODUCT_FEATURE",
  "PRICING_CHANGE",
  "CONTEXT_WINDOW_CHANGE",
  "SDK_CHANGE",
  "GITHUB_CHANGE",
  "NEW_PRODUCT",
  "DEPRECATION",
  "OTHER",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_STATUSES = ["PRE_ANNOUNCEMENT", "CONFIRMED", "DISMISSED"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

/** Points added to an event's confidence score per contributing signal type. Spec-mandated weights. */
export const SIGNAL_CONFIDENCE_WEIGHTS: Record<SignalType, number> = {
  new_model_id: 40,
  new_endpoint: 35,
  sdk_change: 30,
  doc_change: 25,
  pricing_change: 30,
  model_catalog_change: 30,
  github_release: 20,
  capability_change: 25,
  availability_change: 20,
  deprecation: 20,
  product_launch: 30,
  other: 10,
};

/** Classic multi-source corroboration bar. */
export const ALERT_CONFIDENCE_THRESHOLD = 60;
export const ALERT_IMPORTANCE_THRESHOLD = 6;

/**
 * Early single-signal bar. Max deterministic weight for a single signal type is 40
 * (new_model_id), so a hard conf≥60 gate made it *impossible* to alert on a lone
 * model launch / product signal — exactly the early edge this system exists for.
 */
export const ALERT_EARLY_IMPORTANCE_MIN = 8;
export const ALERT_EARLY_CONFIDENCE_MIN = 35;

/** Mid-tier single-signal bar (pricing, deprecation, availability with solid weight). */
export const ALERT_SOLID_CONFIDENCE_MIN = 40;

/**
 * Official blog/product confirmation. LLM classifications often land at conf 15–25
 * after weight scaling — still worth paging if the source is an official channel.
 */
export const ALERT_OFFICIAL_CONFIDENCE_MIN = 15;

/**
 * Never Telegram an event whose first detection is older than this.
 * Stops deploy/sweep backfills (Aug 12 Llama, etc.) from paging as if they were news.
 */
export const ALERT_MAX_AGE_MS = 48 * 60 * 60 * 1000;

export function isAlertFresh(firstDetectedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - firstDetectedAt.getTime() <= ALERT_MAX_AGE_MS;
}

export interface AlertGateOptions {
  /** True when a blog/product_page signal contributed, or the event is CONFIRMED. */
  official?: boolean;
}

/**
 * Alert gate:
 *  1. High-confidence corroboration (conf≥60 && imp≥6)
 *  2. Early high-importance (imp≥8 && conf≥35) — model launches, new products
 *  3. Solid mid-tier (imp≥6 && conf≥40) — pricing/capability with real weight
 *  4. Official-channel (imp≥6 && conf≥15 && official) — Daybreak-class blog news
 */
export function meetsAlertThreshold(
  confidence: number,
  importance: number,
  opts: AlertGateOptions = {},
): boolean {
  if (confidence >= ALERT_CONFIDENCE_THRESHOLD && importance >= ALERT_IMPORTANCE_THRESHOLD) return true;
  if (importance >= ALERT_EARLY_IMPORTANCE_MIN && confidence >= ALERT_EARLY_CONFIDENCE_MIN) return true;
  if (importance >= ALERT_IMPORTANCE_THRESHOLD && confidence >= ALERT_SOLID_CONFIDENCE_MIN) return true;
  if (
    opts.official &&
    importance >= ALERT_IMPORTANCE_THRESHOLD &&
    confidence >= ALERT_OFFICIAL_CONFIDENCE_MIN
  ) {
    return true;
  }
  return false;
}

export function confidenceLabel(confidence: number): "Low" | "Medium" | "High" | "Very High" {
  if (confidence >= 80) return "Very High";
  if (confidence >= 60) return "High";
  if (confidence >= 40) return "Medium";
  return "Low";
}

export interface EvidenceItem {
  sourceUrl: string;
  sourceType: SourceType;
  signalType: SignalType;
  summary: string;
  detectedAt: string;
  confidenceContribution: number;
  diffExcerpt?: string;
}
