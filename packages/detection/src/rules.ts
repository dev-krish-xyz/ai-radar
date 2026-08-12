import type { LineDiff, JsonDiff } from "@ai-radar/crawler";
import type { DetectionContext, RawSignal } from "./types";
import { DEFAULT_IMPORTANCE_BY_EVENT_TYPE } from "./importance";
import { SIGNAL_CONFIDENCE_WEIGHTS, type SignalType, type EventType } from "@ai-radar/shared";
import {
  MODEL_ID_PATTERN,
  ENDPOINT_PATTERN,
  DEPRECATION_PATTERN,
  PRICING_LINE_PATTERN,
  PRICING_AMOUNT_PATTERN,
  CONTEXT_WINDOW_PATTERN,
  AVAILABILITY_PATTERN,
  ANNOUNCEMENT_PATTERN,
  VERSION_PATTERN,
} from "./patterns";

export interface RuleInput {
  context: DetectionContext;
  oldContent: string;
  newContent: string;
  lineDiff: LineDiff;
  /** present only when the source serves JSON, e.g. npm/PyPI registries */
  jsonDiff?: JsonDiff;
}

function makeSignal(
  ctx: DetectionContext,
  signalType: SignalType,
  suggestedEventType: EventType,
  entity: string | null,
  title: string,
  description: string,
  evidenceExtra: Record<string, unknown>,
  detectedAt: Date,
): RawSignal {
  return {
    signalType,
    suggestedEventType,
    entity,
    title,
    description,
    evidence: {
      sourceUrl: ctx.sourceUrl,
      sourceName: ctx.sourceName,
      sourceType: ctx.sourceType,
      ...evidenceExtra,
    },
    confidenceContribution: SIGNAL_CONFIDENCE_WEIGHTS[signalType],
    importanceHint: DEFAULT_IMPORTANCE_BY_EVENT_TYPE[suggestedEventType],
    sourceId: ctx.sourceId,
    providerId: ctx.providerId,
    sourceType: ctx.sourceType,
    sourceUrl: ctx.sourceUrl,
    detectedAt,
  };
}

function uniqueMatches(pattern: RegExp, text: string): string[] {
  const matches = new Set<string>();
  for (const m of text.matchAll(pattern)) matches.add(m[0]);
  return [...matches];
}

/** Runs every deterministic rule against a diff and returns whatever fired. */
export function detectSignals(input: RuleInput, now: Date = new Date()): RawSignal[] {
  const { context: ctx, oldContent, newContent, lineDiff, jsonDiff } = input;
  const signals: RawSignal[] = [];
  const addedText = lineDiff.added.join("\n");
  const removedText = lineDiff.removed.join("\n");

  if (jsonDiff) {
    signals.push(...detectSdkVersionSignals(ctx, jsonDiff, now));
  }

  if (ctx.sourceType === "github_releases") {
    signals.push(...detectGithubReleaseSignals(ctx, lineDiff, oldContent, now));
  }

  if (["docs", "changelog", "model_catalog", "api_reference"].includes(ctx.sourceType)) {
    signals.push(...detectModelIdSignals(ctx, addedText, oldContent, now));
    signals.push(...detectEndpointSignals(ctx, addedText, oldContent, now));
    signals.push(...detectContextWindowSignals(ctx, lineDiff.added, now));
    signals.push(...detectAvailabilitySignals(ctx, lineDiff.added, now));
  }

  if (ctx.sourceType === "pricing") {
    signals.push(...detectPricingSignals(ctx, lineDiff, now));
  }

  if (["blog", "product_page"].includes(ctx.sourceType)) {
    signals.push(...detectAnnouncementSignals(ctx, lineDiff.added, now));
  }

  // Deprecation language matters everywhere providers write prose.
  signals.push(...detectDeprecationSignals(ctx, lineDiff.added, removedText, now));

  return signals;
}

function detectModelIdSignals(ctx: DetectionContext, addedText: string, oldContent: string, now: Date): RawSignal[] {
  const candidates = uniqueMatches(MODEL_ID_PATTERN, addedText);
  const genuinelyNew = candidates.filter((id) => !oldContent.toLowerCase().includes(id.toLowerCase()));
  if (genuinelyNew.length === 0) return [];

  return genuinelyNew.map((entity) =>
    makeSignal(
      ctx,
      "new_model_id",
      /preview/i.test(entity) ? "MODEL_PREVIEW" : "MODEL_LAUNCH",
      entity,
      `New model ID: ${entity}`,
      `"${entity}" appeared on ${ctx.sourceName} and was not present in the previous snapshot.`,
      { matchedId: entity },
      now,
    ),
  );
}

function detectEndpointSignals(ctx: DetectionContext, addedText: string, oldContent: string, now: Date): RawSignal[] {
  const candidates = uniqueMatches(ENDPOINT_PATTERN, addedText);
  const genuinelyNew = candidates.filter((path) => !oldContent.includes(path));
  if (genuinelyNew.length === 0) return [];

  return genuinelyNew.map((path) =>
    makeSignal(
      ctx,
      "new_endpoint",
      "NEW_ENDPOINT",
      null,
      `New API path: ${path}`,
      `"${path}" appeared on ${ctx.sourceName} and was not present in the previous snapshot.`,
      { matchedPath: path },
      now,
    ),
  );
}

function detectContextWindowSignals(ctx: DetectionContext, addedLines: string[], now: Date): RawSignal[] {
  const line = addedLines.find((l) => CONTEXT_WINDOW_PATTERN.test(l));
  if (!line) return [];
  return [
    makeSignal(
      ctx,
      "capability_change",
      "CONTEXT_WINDOW_CHANGE",
      null,
      "Context window change detected",
      line.slice(0, 300),
      { matchedLine: line.slice(0, 300) },
      now,
    ),
  ];
}

function detectAvailabilitySignals(ctx: DetectionContext, addedLines: string[], now: Date): RawSignal[] {
  const line = addedLines.find((l) => AVAILABILITY_PATTERN.test(l));
  if (!line) return [];
  return [
    makeSignal(
      ctx,
      "availability_change",
      "AVAILABILITY_CHANGE",
      null,
      "Availability change detected",
      line.slice(0, 300),
      { matchedLine: line.slice(0, 300) },
      now,
    ),
  ];
}

function detectDeprecationSignals(ctx: DetectionContext, addedLines: string[], removedText: string, now: Date): RawSignal[] {
  const line = addedLines.find((l) => DEPRECATION_PATTERN.test(l));
  if (!line) return [];
  return [
    makeSignal(
      ctx,
      "deprecation",
      "DEPRECATION",
      null,
      "Deprecation / migration notice detected",
      line.slice(0, 300),
      { matchedLine: line.slice(0, 300) },
      now,
    ),
  ];
}

function detectPricingSignals(ctx: DetectionContext, lineDiff: LineDiff, now: Date): RawSignal[] {
  const addedPriceLines = lineDiff.added.filter(
    (l) => PRICING_LINE_PATTERN.test(l) || PRICING_AMOUNT_PATTERN.test(l),
  );
  const removedPriceLines = lineDiff.removed.filter(
    (l) => PRICING_LINE_PATTERN.test(l) || PRICING_AMOUNT_PATTERN.test(l),
  );
  if (addedPriceLines.length === 0 && removedPriceLines.length === 0) return [];

  return [
    makeSignal(
      ctx,
      "pricing_change",
      "PRICING_CHANGE",
      null,
      "Pricing page changed",
      `${addedPriceLines.length} price line(s) added, ${removedPriceLines.length} removed on ${ctx.sourceName}.`,
      { added: addedPriceLines.slice(0, 10), removed: removedPriceLines.slice(0, 10) },
      now,
    ),
  ];
}

function detectAnnouncementSignals(ctx: DetectionContext, addedLines: string[], now: Date): RawSignal[] {
  const line = addedLines.find((l) => ANNOUNCEMENT_PATTERN.test(l) && MODEL_ID_PATTERN.test(l));
  if (!line) return [];
  MODEL_ID_PATTERN.lastIndex = 0;
  const entityMatch = line.match(MODEL_ID_PATTERN);
  const entity = entityMatch ? entityMatch[0] : null;
  return [
    makeSignal(
      ctx,
      "product_launch",
      "NEW_PRODUCT",
      entity,
      entity ? `Announcement mentions ${entity}` : "Announcement-style copy detected",
      line.slice(0, 300),
      { matchedLine: line.slice(0, 300) },
      now,
    ),
  ];
}

function detectGithubReleaseSignals(ctx: DetectionContext, lineDiff: LineDiff, oldContent: string, now: Date): RawSignal[] {
  const candidates = lineDiff.added.filter((l) => VERSION_PATTERN.test(l) && !oldContent.includes(l));
  if (candidates.length === 0) return [];
  const line = candidates[0]!;
  const versionMatch = line.match(VERSION_PATTERN);
  return [
    makeSignal(
      ctx,
      "github_release",
      "GITHUB_CHANGE",
      versionMatch ? versionMatch[1] : null,
      `New GitHub release on ${ctx.sourceName}`,
      line.slice(0, 300),
      { matchedLine: line.slice(0, 300) },
      now,
    ),
  ];
}

function detectSdkVersionSignals(ctx: DetectionContext, jsonDiff: JsonDiff, now: Date): RawSignal[] {
  const versionPathPattern = /^\$\.(versions|releases)\.([^.[\]]+)$/;
  const newVersions = jsonDiff.added
    .map((entry) => entry.path.match(versionPathPattern))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => m[2]!);

  if (newVersions.length === 0) return [];

  return newVersions.map((version) =>
    makeSignal(
      ctx,
      "sdk_change",
      "SDK_CHANGE",
      version,
      `New SDK release: ${version}`,
      `${ctx.sourceName} published version ${version}.`,
      { version },
      now,
    ),
  );
}

/** True when a diff has enough substance to be worth an LLM semantic-significance check. */
export function needsSemanticReview(lineDiff: LineDiff, alreadyFiredRuleSignals: number): boolean {
  if (alreadyFiredRuleSignals > 0) return false;
  return lineDiff.added.length >= 2 || lineDiff.removed.length >= 2;
}
