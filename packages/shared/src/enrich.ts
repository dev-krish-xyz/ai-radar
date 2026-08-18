import Groq from "groq-sdk";
import { env } from "./env";
import { canCallGroq, isGroqRateLimit, noteGroqCall, pauseGroqForTick } from "./groqBudget";

export interface EnrichInput {
  providerName: string;
  eventType: string;
  title: string;
  summary: string;
  entity: string | null;
  sourceUrl: string;
  official: boolean;
}

export interface AlertEnrichment {
  novelty: number;
  relevance: number;
  impact: number;
  timing: number;
  social: number;
  clusterKey: string;
  whyItMatters: string;
  whatHappensNext: string;
  postAngle: string;
  skip: boolean;
}

const TOOL_NAME = "emit_enrichment";
const MODEL = "openai/gpt-oss-120b";

let client: Groq | null = null;
function getClient(): Groq | null {
  const apiKey = env.groqApiKey;
  if (!apiKey) return null;
  if (!client) client = new Groq({ apiKey });
  return client;
}

function clampScore(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 5;
  return Math.min(10, Math.max(1, Math.round(n)));
}

function slugKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/**
 * Intelligence pass on an alert that already passed deterministic quality.
 * Tool-forced JSON only — never free text into Telegram.
 */
export async function enrichAlert(input: EnrichInput): Promise<AlertEnrichment | null> {
  if (!canCallGroq()) {
    console.log("[groq] enrich skip budget");
    return null;
  }

  const groq = getClient();
  if (!groq) {
    console.warn("[groq] enrich skip: GROQ_API_KEY not set");
    return null;
  }

  noteGroqCall();

  try {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content:
            "You enrich a single AI-intel alert for a creator who posts early, specific X threads " +
            "(model leaks, pricing surprises, unreleased IDs, major product numbers). " +
            "Score honestly. skip=true for recaps, SEO roundups, already-mainstream stories, " +
            "SDK version bumps, and anything that would not make a unique post. " +
            `Always call ${TOOL_NAME}, never free text.`,
        },
        {
          role: "user",
          content: [
            `Provider: ${input.providerName}`,
            `Type: ${input.eventType}`,
            `Title: ${input.title}`,
            `Entity: ${input.entity ?? "(none)"}`,
            `Official channel: ${input.official}`,
            `Source: ${input.sourceUrl}`,
            `Summary: ${input.summary.slice(0, 800)}`,
          ].join("\n"),
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: TOOL_NAME,
            description: "Emit ranked enrichment for the alert.",
            parameters: {
              type: "object",
              properties: {
                novelty: { type: "integer", minimum: 1, maximum: 10 },
                relevance: { type: "integer", minimum: 1, maximum: 10 },
                impact: { type: "integer", minimum: 1, maximum: 10 },
                timing: { type: "integer", minimum: 1, maximum: 10 },
                social: { type: "integer", minimum: 1, maximum: 10 },
                cluster_key: {
                  type: "string",
                  description: "Short stable slug for this story, e.g. grok-4-7-release",
                },
                why_it_matters: { type: "string" },
                what_happens_next: { type: "string" },
                post_angle: { type: "string" },
                skip: { type: "boolean" },
              },
              required: [
                "novelty",
                "relevance",
                "impact",
                "timing",
                "social",
                "cluster_key",
                "why_it_matters",
                "what_happens_next",
                "post_angle",
                "skip",
              ],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: TOOL_NAME } },
    });

    const toolCall = completion.choices[0]?.message?.tool_calls?.find(
      (t) => t.type === "function" && t.function.name === TOOL_NAME,
    );
    if (!toolCall || toolCall.type !== "function") return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch {
      return null;
    }
    return parseEnrichment(parsed, input);
  } catch (err) {
    if (isGroqRateLimit(err)) pauseGroqForTick("429 rate limit");
    else console.error("[groq] enrich failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

function parseEnrichment(raw: unknown, input: EnrichInput): AlertEnrichment | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.skip !== "boolean") return null;
  if (typeof r.why_it_matters !== "string" || r.why_it_matters.length === 0) return null;
  if (typeof r.what_happens_next !== "string" || r.what_happens_next.length === 0) return null;
  if (typeof r.post_angle !== "string" || r.post_angle.length === 0) return null;

  const clusterRaw = typeof r.cluster_key === "string" && r.cluster_key.length > 2 ? r.cluster_key : input.entity ?? input.title;

  return {
    novelty: clampScore(r.novelty),
    relevance: clampScore(r.relevance),
    impact: clampScore(r.impact),
    timing: clampScore(r.timing),
    social: clampScore(r.social),
    clusterKey: slugKey(clusterRaw),
    whyItMatters: r.why_it_matters.slice(0, 280),
    whatHappensNext: r.what_happens_next.slice(0, 220),
    postAngle: r.post_angle.slice(0, 180),
    skip: r.skip,
  };
}

/** Official model IDs / leaks still send even if Groq social score is timid. */
export function enrichShouldSuppress(
  enrich: AlertEnrichment,
  opts: { official: boolean; eventType: string; leakish: boolean },
): boolean {
  if (enrich.skip) {
    if (opts.official && (opts.eventType === "MODEL_LAUNCH" || opts.eventType === "MODEL_PREVIEW")) return false;
    if (opts.leakish) return false;
    return true;
  }
  if (enrich.social < 6 && !opts.official && !opts.leakish && opts.eventType !== "MODEL_LAUNCH") {
    return true;
  }
  return false;
}
