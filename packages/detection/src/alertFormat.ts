import type { EvidenceItem, EventStatus } from "@ai-radar/shared";

export interface AlertInput {
  providerName: string;
  title: string;
  confidence: number;
  importance: number;
  status: EventStatus;
  firstDetectedAt: Date;
  evidence: EvidenceItem[];
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatStatus(status: EventStatus): string {
  return status.replace(/_/g, "-");
}

/** Renders the spec's Telegram alert format, HTML-escaping every interpolated field. */
export function formatTelegramAlert(input: AlertInput): string {
  const time = input.firstDetectedAt.toISOString().slice(11, 16);

  const evidenceLines = input.evidence.map((e) => `• ${escapeHtml(e.summary)}`).join("\n");
  const sourceTags = [...new Set(input.evidence.map((e) => e.sourceType.toUpperCase()))]
    .map((s) => `[${escapeHtml(s)}]`)
    .join("\n");
  const sourceLinks = input.evidence
    .map((e) => `<a href="${escapeHtml(e.sourceUrl)}">${escapeHtml(e.sourceType)}</a>`)
    .join(" · ");

  return [
    `🚨 <b>HIGH-CONFIDENCE AI SIGNAL</b>`,
    "",
    `<b>${escapeHtml(input.title)}</b>`,
    "",
    `Confidence: ${input.confidence}%`,
    `Importance: ${input.importance}/10`,
    `Status: ${formatStatus(input.status)}`,
    "",
    `Evidence:`,
    evidenceLines,
    "",
    `First detected: ${time} UTC`,
    "",
    `Sources:`,
    sourceTags,
    sourceLinks,
  ].join("\n");
}
