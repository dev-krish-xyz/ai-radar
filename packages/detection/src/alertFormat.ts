import type { EvidenceItem, EventStatus, EventType } from "@ai-radar/shared";
import { displayHost } from "./publicUrl";

export interface AlertInput {
  providerName: string;
  title: string;
  summary?: string;
  entity?: string | null;
  eventType?: EventType;
  confidence: number;
  importance: number;
  status: EventStatus;
  firstDetectedAt: Date;
  evidence: EvidenceItem[];
  whyItMatters?: string;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const TYPE_LABEL: Record<EventType, string> = {
  MODEL_LAUNCH: "MODEL LAUNCH",
  MODEL_PREVIEW: "MODEL PREVIEW",
  NEW_PRODUCT: "NEW PRODUCT",
  CAPABILITY_CHANGE: "CAPABILITY",
  CONTEXT_WINDOW_CHANGE: "CONTEXT WINDOW",
  AVAILABILITY_CHANGE: "AVAILABILITY",
  NEW_ENDPOINT: "NEW ENDPOINT",
  API_CHANGE: "API CHANGE",
  DEV_FEATURE: "DEV FEATURE",
  PRODUCT_FEATURE: "PRODUCT",
  PRICING_CHANGE: "PRICING",
  DEPRECATION: "DEPRECATION",
  SDK_CHANGE: "SDK",
  GITHUB_CHANGE: "GITHUB",
  OTHER: "UPDATE",
};

function typeEmoji(type: EventType | undefined, title: string): string {
  const t = `${type ?? ""} ${title}`.toLowerCase();
  if (/leak|rumou?r|unreleased|codename|spotted/.test(t)) return "👀";
  switch (type) {
    case "MODEL_LAUNCH":
    case "MODEL_PREVIEW":
      return "🚀";
    case "PRICING_CHANGE":
      return "💰";
    case "NEW_PRODUCT":
      return /paper/i.test(title) ? "📄" : "📝";
    case "DEPRECATION":
      return "⚠️";
    default:
      return "⚡";
  }
}

function headline(input: AlertInput): string {
  if (input.entity && input.entity.length >= 3 && input.entity.length <= 80) {
    return input.entity;
  }
  return input.title
    .replace(/^[^—]+—\s*Possible\s+/i, "")
    .replace(/^(Feed|Rising AI repo|HF Daily Paper|New model ID):\s*/i, "")
    .trim();
}

function firstSentence(text: string, max = 280): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const cut = cleaned.match(/^.{1,280}?[.!?](?:\s|$)/);
  const sentence = (cut?.[0] ?? cleaned).trim();
  return sentence.length > max ? `${sentence.slice(0, max - 1)}…` : sentence;
}

function formatWhen(d: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCHours().toString().padStart(2, "0")}:${d
    .getUTCMinutes()
    .toString()
    .padStart(2, "0")} UTC`;
}

/** Compact, scannable Telegram card with a single original-source link. */
export function formatTelegramAlert(input: AlertInput): string {
  const type = input.eventType;
  const emoji = typeEmoji(type, input.title);
  const kind = type ? TYPE_LABEL[type] : "UPDATE";
  const statusBit = input.status === "CONFIRMED" ? " · CONFIRMED" : "";

  const primary = input.evidence.find((e) => e.sourceUrl && /^https?:\/\//i.test(e.sourceUrl));
  const sourceUrl = primary?.sourceUrl ?? "";
  const sourceLabel = sourceUrl ? displayHost(sourceUrl) : input.evidence[0]?.sourceType ?? "source";

  const summary = firstSentence(input.summary ?? input.evidence[0]?.summary ?? "");
  const why = input.whyItMatters?.trim();

  const extraMeta: string[] = [];
  const stars = input.evidence
    .map((e) => (e as EvidenceItem & { stars?: number }).stars)
    .find((n) => typeof n === "number");
  if (typeof stars === "number" && stars > 0) extraMeta.push(`${stars}★`);

  const lines = [
    `${emoji} <b>${escapeHtml(kind)} · ${escapeHtml(input.providerName)}${statusBit}</b>`,
    "",
    `<b>${escapeHtml(headline(input))}</b>`,
  ];

  if (summary) {
    lines.push("", escapeHtml(summary));
  }
  if (why) {
    lines.push("", `<i>${escapeHtml(why)}</i>`);
  }

  lines.push("");
  if (sourceUrl) {
    lines.push(`🔗 <a href="${escapeHtml(sourceUrl)}">${escapeHtml(sourceLabel)}</a>`);
  }
  lines.push(`🕒 ${formatWhen(input.firstDetectedAt)}${extraMeta.length ? ` · ${extraMeta.join(" · ")}` : ""}`);

  return lines.join("\n");
}
