import type { EventType } from "@ai-radar/shared";

/** Default importance (1-10) by event type, used to seed events before corroboration bonuses. */
export const DEFAULT_IMPORTANCE_BY_EVENT_TYPE: Record<EventType, number> = {
  MODEL_LAUNCH: 9,
  MODEL_PREVIEW: 8,
  NEW_PRODUCT: 9,
  CAPABILITY_CHANGE: 7,
  CONTEXT_WINDOW_CHANGE: 7,
  AVAILABILITY_CHANGE: 6,
  NEW_ENDPOINT: 6,
  API_CHANGE: 6,
  DEV_FEATURE: 5,
  PRODUCT_FEATURE: 6,
  PRICING_CHANGE: 6,
  DEPRECATION: 6,
  SDK_CHANGE: 4,
  GITHUB_CHANGE: 4,
  OTHER: 3,
};
