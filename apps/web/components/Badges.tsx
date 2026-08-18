import type { EventStatus } from "@/lib/api";

export function StatusBadge({ status }: { status: EventStatus }) {
  const styles: Record<EventStatus, string> = {
    PRE_ANNOUNCEMENT: "bg-amber-soft text-amber",
    CONFIRMED: "bg-emerald-soft text-emerald",
    DISMISSED: "bg-neutral-soft text-text-tertiary",
  };
  const labels: Record<EventStatus, string> = {
    PRE_ANNOUNCEMENT: "Early",
    CONFIRMED: "Confirmed",
    DISMISSED: "Dismissed",
  };
  return (
    <span className={`inline-block shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function confidenceColor(confidence: number): string {
  if (confidence >= 80) return "text-emerald";
  if (confidence >= 60) return "text-accent-text";
  if (confidence >= 40) return "text-amber";
  return "text-text-tertiary";
}

export function ConfidenceBadge({ confidence }: { confidence: number }) {
  return <span className={`font-semibold ${confidenceColor(confidence)}`}>{confidence}%</span>;
}

export function ImportanceBadge({ importance }: { importance: number }) {
  return (
    <span className="text-text-secondary">
      {importance}
      <span className="text-text-tertiary">/10</span>
    </span>
  );
}
