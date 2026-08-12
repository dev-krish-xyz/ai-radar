import type { EventType, SignalType, SourceType } from "@ai-radar/shared";

export interface DetectionContext {
  providerId: number;
  providerName: string;
  sourceId: number;
  sourceName: string;
  sourceType: SourceType;
  sourceUrl: string;
}

/** A signal not yet persisted — output of rule-based or LLM detection. */
export interface RawSignal {
  signalType: SignalType;
  suggestedEventType: EventType;
  entity: string | null;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  confidenceContribution: number;
  /** rough per-signal importance estimate (1-10), used to seed an event's importance */
  importanceHint: number;
  sourceId: number;
  providerId: number;
  sourceType: SourceType;
  sourceUrl: string;
  detectedAt: Date;
}

/** Minimal shape of a persisted signal row, as needed by correlation/confidence math. */
export interface SignalRecord {
  id: number;
  signalType: SignalType;
  suggestedEventType?: EventType;
  entity: string | null;
  title: string;
  description: string;
  confidenceContribution: number;
  sourceType: SourceType;
  detectedAt: Date;
}

/** Minimal shape of a persisted event row, as needed for correlation matching. */
export interface EventRecord {
  id: number;
  providerId: number;
  type: EventType;
  title: string;
  summary: string;
  entity: string | null;
  status: "PRE_ANNOUNCEMENT" | "CONFIRMED" | "DISMISSED";
  firstDetectedAt: Date;
  updatedAt: Date;
}

export interface EventAggregate {
  type: EventType;
  title: string;
  summary: string;
  entity: string | null;
  confidence: number;
  importance: number;
}
