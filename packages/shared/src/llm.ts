import Groq from "groq-sdk";
import { env } from "./env";
import { EVENT_TYPES, type EventType } from "./types";

export interface DiffClassificationInput {
  providerName: string;
  sourceName: string;
  sourceType: string;
  sourceUrl: string;
  /** unified-diff-style or line-added/removed excerpt, already trimmed to a reasonable size */
  diffExcerpt: string;
}

export interface DiffClassification {
  significant: boolean;
  eventType: EventType;
  title: string;
  summary: string;
  entity: string | null;
  importance: number; // 1-10
  confidence: number; // 0-1
}

const TOOL_NAME = "emit_classification";
const MODEL = "llama-3.3-70b-versatile";

let client: Groq | null = null;
function getClient(): Groq | null {
  const apiKey = env.groqApiKey;
  if (!apiKey) return null;
  if (!client) client = new Groq({ apiKey });
  return client;
}

/**
 * Ask the LLM whether a raw content diff represents a meaningful AI product/model
 * change, per the spec's "ignore typos/formatting/nav/tracking noise" rules.
 * Only called when deterministic rules could not already classify the diff
 * (see packages/detection). Output is a validated, bounded JSON shape — never
 * free text — so it can only ever populate a signal, not trigger arbitrary actions.
 */
export async function classifyDiffSignificance(
  input: DiffClassificationInput,
): Promise<DiffClassification | null> {
  const groq = getClient();
  if (!groq) {
    console.warn("[llm] GROQ_API_KEY not set, skipping semantic classification");
    return null;
  }

  const completion = await groq.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: "system",
        content:
          "You are a filter inside an AI product-release monitoring pipeline. You are shown a diff " +
          "of what changed on an official AI provider source (blog, docs, changelog, model catalog, " +
          "API reference, pricing page, GitHub repo, or SDK). Decide if the change is a MEANINGFUL " +
          "product signal: new model/model ID, model preview, availability change, capability change, " +
          "new API endpoint, major API change, new dev feature, major product feature, pricing change, " +
          "context-window change, major SDK change, important GitHub change, new AI product/tool, or " +
          "deprecation/migration. Mark significant=false for typos, formatting, navigation, wording, " +
          "tracking/analytics, generated-file noise, or unimportant commits. Always call the " +
          `${TOOL_NAME} tool with your answer, never respond in free text.`,
      },
      {
        role: "user",
        content: `Provider: ${input.providerName}\nSource: ${input.sourceName} (${input.sourceType})\nURL: ${input.sourceUrl}\n\nDiff:\n${input.diffExcerpt}`,
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: TOOL_NAME,
          description: "Emit a structured classification of the diff.",
          parameters: {
            type: "object",
            properties: {
              significant: { type: "boolean" },
              event_type: { type: "string", enum: [...EVENT_TYPES] },
              title: { type: "string", description: "Short human title, e.g. 'Possible new Claude model'" },
              summary: { type: "string", description: "1-3 sentence summary of what changed and why it matters" },
              entity: { type: ["string", "null"], description: "Model/product name or ID if identifiable, else null" },
              importance: { type: "integer", minimum: 1, maximum: 10 },
              confidence: { type: "number", minimum: 0, maximum: 1 },
            },
            required: ["significant", "event_type", "title", "summary", "entity", "importance", "confidence"],
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

  return parseAndValidate(parsed);
}

function parseAndValidate(raw: unknown): DiffClassification | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  if (typeof r.significant !== "boolean") return null;
  if (typeof r.event_type !== "string" || !EVENT_TYPES.includes(r.event_type as EventType)) return null;
  if (typeof r.title !== "string" || r.title.length === 0 || r.title.length > 200) return null;
  if (typeof r.summary !== "string" || r.summary.length === 0 || r.summary.length > 1000) return null;
  if (typeof r.importance !== "number" || !Number.isFinite(r.importance)) return null;
  if (typeof r.confidence !== "number" || !Number.isFinite(r.confidence)) return null;

  const entity = typeof r.entity === "string" && r.entity.length > 0 ? r.entity.slice(0, 200) : null;

  return {
    significant: r.significant,
    eventType: r.event_type as EventType,
    title: r.title.slice(0, 200),
    summary: r.summary.slice(0, 1000),
    entity,
    importance: Math.min(10, Math.max(1, Math.round(r.importance))),
    confidence: Math.min(1, Math.max(0, r.confidence)),
  };
}
