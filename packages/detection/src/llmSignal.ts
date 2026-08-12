import type { DiffClassification } from "@ai-radar/shared";
import type { EventType, SignalType } from "@ai-radar/shared";
import type { DetectionContext, RawSignal } from "./types";

/** Best-fit SignalType for an LLM-derived EventType, used only for confidence weighting. */
const EVENT_TYPE_TO_SIGNAL_TYPE: Record<EventType, SignalType> = {
  MODEL_LAUNCH: "new_model_id",
  MODEL_PREVIEW: "new_model_id",
  NEW_PRODUCT: "product_launch",
  CAPABILITY_CHANGE: "capability_change",
  CONTEXT_WINDOW_CHANGE: "capability_change",
  AVAILABILITY_CHANGE: "availability_change",
  NEW_ENDPOINT: "new_endpoint",
  API_CHANGE: "doc_change",
  DEV_FEATURE: "doc_change",
  PRODUCT_FEATURE: "doc_change",
  PRICING_CHANGE: "pricing_change",
  DEPRECATION: "deprecation",
  SDK_CHANGE: "sdk_change",
  GITHUB_CHANGE: "github_release",
  OTHER: "other",
};

/**
 * Turns a validated LLM classification into a RawSignal. The LLM's own confidence
 * (0-1) scales the base weight for its inferred signal type, so a low-confidence
 * "maybe" call contributes proportionally less than a rule-based hard match.
 */
export function signalFromLlmClassification(
  ctx: DetectionContext,
  classification: DiffClassification,
  weightTable: Record<SignalType, number>,
  now: Date = new Date(),
): RawSignal | null {
  if (!classification.significant) return null;

  const signalType = EVENT_TYPE_TO_SIGNAL_TYPE[classification.eventType];
  const baseWeight = weightTable[signalType];

  return {
    signalType,
    suggestedEventType: classification.eventType,
    entity: classification.entity,
    title: classification.title,
    description: classification.summary,
    evidence: {
      sourceUrl: ctx.sourceUrl,
      sourceName: ctx.sourceName,
      sourceType: ctx.sourceType,
      llmClassified: true,
      llmConfidence: classification.confidence,
    },
    confidenceContribution: Math.round(baseWeight * classification.confidence),
    importanceHint: classification.importance,
    sourceId: ctx.sourceId,
    providerId: ctx.providerId,
    sourceType: ctx.sourceType,
    sourceUrl: ctx.sourceUrl,
    detectedAt: now,
  };
}
