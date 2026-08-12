import type { EventType } from "@ai-radar/shared";
import type { EventAggregate, SignalRecord } from "./types";
import { computeConfidence, computeImportance } from "./confidence";

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  MODEL_LAUNCH: "New Model",
  MODEL_PREVIEW: "New Model Preview",
  NEW_PRODUCT: "New AI Product",
  CAPABILITY_CHANGE: "Capability Change",
  CONTEXT_WINDOW_CHANGE: "Context Window Change",
  AVAILABILITY_CHANGE: "Availability Change",
  NEW_ENDPOINT: "New API Endpoint",
  API_CHANGE: "API Change",
  DEV_FEATURE: "New Developer Feature",
  PRODUCT_FEATURE: "Product Feature",
  PRICING_CHANGE: "Pricing Change",
  DEPRECATION: "Deprecation / Migration",
  SDK_CHANGE: "SDK Update",
  GITHUB_CHANGE: "GitHub Release",
  OTHER: "Update",
};

function deriveEventType(signals: SignalRecord[]): EventType {
  const weight = new Map<EventType, number>();
  for (const s of signals) {
    const t = s.suggestedEventType ?? "OTHER";
    weight.set(t, (weight.get(t) ?? 0) + s.confidenceContribution);
  }
  let best: EventType = "OTHER";
  let bestScore = -1;
  for (const [type, score] of weight) {
    if (score > bestScore) {
      best = type;
      bestScore = score;
    }
  }
  return best;
}

function deriveEntity(signals: SignalRecord[]): string | null {
  const withEntity = signals.find((s) => s.entity);
  return withEntity?.entity ?? null;
}

/** Builds (or rebuilds) an event's derived fields from its full set of contributing signals. */
export function buildEventAggregate(providerName: string, signals: SignalRecord[]): EventAggregate {
  const type = deriveEventType(signals);
  const entity = deriveEntity(signals);
  const label = EVENT_TYPE_LABELS[type];

  const title = entity ? `${providerName} — Possible ${label}: ${entity}` : `${providerName} — Possible ${label}`;

  const distinctDescriptions = [...new Set(signals.map((s) => s.description.trim()).filter(Boolean))];
  const summary =
    signals.length === 1
      ? distinctDescriptions[0]!
      : `${signals.length} independent signals detected. ` + distinctDescriptions.slice(0, 4).join(" ");

  return {
    type,
    title,
    summary: summary.slice(0, 2000),
    entity,
    confidence: computeConfidence(signals),
    importance: computeImportance(signals),
  };
}
