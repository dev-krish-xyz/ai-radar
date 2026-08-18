import type { EventType, SourceType } from "@ai-radar/shared";

export interface QualitySignal {
  title: string;
  description: string;
  sourceType: SourceType;
  entity: string | null;
  suggestedEventType?: EventType;
  evidence: Record<string, unknown>;
}

export interface QualityInput {
  eventType: EventType;
  title: string;
  summary: string;
  entity: string | null;
  importance: number;
  confidence: number;
  official: boolean;
  signals: QualitySignal[];
}

const LOW_EVENT_TYPES = new Set<EventType>(["SDK_CHANGE", "GITHUB_CHANGE", "DEV_FEATURE", "API_CHANGE"]);

const NOISE_TITLE =
  /\b(weekly roundup|this week in|newsletter|what we['’]?re reading|linkdump|links for|week in review)\b/i;

const JUNK_MODEL =
  /(gguf|q[2-8]_k|q[2-8]_0|imatrix|-lora\b|-qlora|-awq|-gptq|-exl2|eval-|test-|dummy-|sample-|tokenizer)/i;

const HIGH_PAPER =
  /\b(sota|state[- ]of[- ]the[- ]art|beats|outperform|foundation model|reasoning|agentic|computer[- ]use|open[- ]weights?|new model|multimodal|benchmark)\b/i;

const COMPANY_NEWS = /\b(revenue|arr\b|run[- ]rate|valuat|fund(ing|ed)?|ipo\b|acqui(re|red|sition))\b/i;

const LEAKISH =
  /\b(leak|rumou?r|unreleased|codename|spotted|internal(ly)?|coming (this )?(week|soon)|mewfour|mythos|astra|daybreak)\b/i;

const MIN_RISING_STARS = 50;

function blobOf(input: QualityInput): string {
  return `${input.title} ${input.summary} ${input.entity ?? ""}`.toLowerCase();
}

function isRisingRepo(s: QualitySignal): boolean {
  return Boolean(s.evidence.repo) || /rising ai repo/i.test(s.title);
}

function isDailyPaper(s: QualitySignal): boolean {
  return Boolean(s.evidence.paperId) || /hf daily paper/i.test(s.title);
}

function isHnStory(s: QualitySignal): boolean {
  return Boolean(s.evidence.hnId) || /^HN:/i.test(s.title);
}

function maxStars(signals: QualitySignal[]): number {
  let max = 0;
  for (const s of signals) {
    const n = s.evidence.stars;
    if (typeof n === "number" && n > max) max = n;
  }
  return max;
}

/** One-line "why this is postable" for the Telegram card. */
export function whyItMatters(input: QualityInput): string {
  const blob = blobOf(input);
  if (LEAKISH.test(blob)) return "Looks like a leak / unreleased model — postable before official handles.";
  if (input.eventType === "MODEL_LAUNCH" || input.eventType === "MODEL_PREVIEW") {
    return "New model ID on an official or catalog source.";
  }
  if (input.eventType === "PRICING_CHANGE") return "Pricing change — users notice these immediately.";
  if (input.signals.some(isRisingRepo)) {
    return "New AI repo climbing GitHub before recap accounts pick it up.";
  }
  if (input.signals.some(isDailyPaper)) return "New paper on HF Daily — early research angle.";
  if (input.signals.some(isHnStory)) return "Climbing Hacker News in the last 4 hours — early social proof.";
  if (COMPANY_NEWS.test(blob)) return "Company-level news (revenue / funding / deal).";
  if (input.official) return "Official announcement channel.";
  if (input.eventType === "NEW_PRODUCT") return "New product / feature worth a timely post.";
  return "Actionable AI update with enough weight to page.";
}

/**
 * Hard quality gate before Telegram. Thresholds already ran; this kills
 * recycled news, SDK bumps, junk HF uploads, and low-star repo spam.
 */
export function isHighSignalAlert(input: QualityInput): boolean {
  if (NOISE_TITLE.test(input.title) || NOISE_TITLE.test(input.summary)) return false;

  if (input.entity && JUNK_MODEL.test(input.entity)) return false;
  if (JUNK_MODEL.test(input.title)) return false;

  const blob = blobOf(input);
  const leak = LEAKISH.test(blob);
  const company = COMPANY_NEWS.test(blob);

  if (input.signals.some(isRisingRepo)) {
    const stars = maxStars(input.signals);
    if (stars >= MIN_RISING_STARS) return true;
    // github.com/trending HTML has no star count — first appearance is still postable.
    return input.signals.some((s) =>
      /trending/i.test(`${s.evidence.sourceName ?? ""} ${s.evidence.crawlUrl ?? ""} ${s.evidence.sourceUrl ?? ""}`),
    );
  }

  if (input.signals.some(isDailyPaper)) {
    return HIGH_PAPER.test(blob);
  }

  if (input.signals.some(isHnStory)) {
    const pts = input.signals.map((s) => s.evidence.points).find((n) => typeof n === "number");
    return typeof pts !== "number" || pts >= 15;
  }

  if (LOW_EVENT_TYPES.has(input.eventType) && !leak) return false;

  if (
    input.eventType === "MODEL_LAUNCH" ||
    input.eventType === "MODEL_PREVIEW" ||
    input.eventType === "PRICING_CHANGE" ||
    input.eventType === "CONTEXT_WINDOW_CHANGE"
  ) {
    return true;
  }

  if (input.official || leak || company) return true;

  if (input.eventType === "NEW_PRODUCT" || input.eventType === "PRODUCT_FEATURE") return true;
  if (input.eventType === "DEPRECATION" || input.eventType === "AVAILABILITY_CHANGE") return true;
  if (input.eventType === "CAPABILITY_CHANGE") return true;

  return input.importance >= 7 && input.confidence >= 45;
}

export { MIN_RISING_STARS };
