import type { SignalRecord } from "./types";
import { DEFAULT_IMPORTANCE_BY_EVENT_TYPE } from "./importance";

/**
 * Confidence = sum of the strongest contribution per distinct signal type (so five
 * doc_change hits don't outweigh one new_model_id), plus a corroboration bonus for
 * independent source types agreeing, capped at 100. This directly implements the
 * spec's "one highly reliable early signal over 100 noisy signals" preference:
 * duplicate signal types don't stack, but distinct kinds of evidence do.
 */
export function computeConfidence(signals: SignalRecord[]): number {
  if (signals.length === 0) return 0;

  const bestByType = new Map<string, number>();
  const sourceTypes = new Set<string>();
  for (const s of signals) {
    const current = bestByType.get(s.signalType) ?? 0;
    bestByType.set(s.signalType, Math.max(current, s.confidenceContribution));
    sourceTypes.add(s.sourceType);
  }

  const base = [...bestByType.values()].reduce((sum, v) => sum + v, 0);
  const corroborationBonus = sourceTypes.size >= 3 ? 10 : sourceTypes.size >= 2 ? 5 : 0;

  return Math.min(100, base + corroborationBonus);
}

/**
 * Importance = highest default importance among the event types the contributing
 * signals suggest, with a small corroboration bump for 3+ independent signals.
 */
export function computeImportance(signals: SignalRecord[]): number {
  if (signals.length === 0) return 1;

  const base = Math.max(
    ...signals.map((s) => DEFAULT_IMPORTANCE_BY_EVENT_TYPE[s.suggestedEventType ?? "OTHER"]),
  );
  const bonus = signals.length >= 3 ? 1 : 0;
  return Math.min(10, base + bonus);
}
