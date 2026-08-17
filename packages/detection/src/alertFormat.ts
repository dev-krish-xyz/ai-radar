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
  const postable = input.evidence.some((e) => {
    const ev = e as EvidenceItem & { postable?: boolean };
    return ev.postable || /Rising AI repo|HF Daily Paper/i.test(e.summary) || /Rising AI repo|HF Daily Paper/i.test(input.title);
  });

  const evidenceLines = input.evidence.map((e) => `• ${escapeHtml(e.summary)}`).join("\n");
  const sourceLinks = input.evidence
    .map((e) => `<a href="${escapeHtml(e.sourceUrl)}">${escapeHtml(e.sourceType)}</a>`)
    .join(" · ");

  if (postable) {
    return [
      `📝 <b>POSTABLE — early AI content</b>`,
      "",
      `<b>${escapeHtml(input.title)}</b>`,
      "",
      evidenceLines,
      "",
      `Why now: showed up on a public list before most recap accounts.`,
      `Importance: ${input.importance}/10 · ${time} UTC`,
      sourceLinks,
    ].join("\n");
  }

  const sourceTags = [...new Set(input.evidence.map((e) => e.sourceType.toUpperCase()))]
    .map((s) => `[${escapeHtml(s)}]`)
    .join("\n");

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
