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

export const ALERT_CONFIDENCE_THRESHOLD = 60;
export const ALERT_IMPORTANCE_THRESHOLD = 6;

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
