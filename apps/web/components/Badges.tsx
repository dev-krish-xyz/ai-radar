import type { EventStatus } from "@/lib/api";

export function StatusBadge({ status }: { status: EventStatus }) {
  const styles: Record<EventStatus, string> = {
    PRE_ANNOUNCEMENT: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    CONFIRMED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    DISMISSED: "bg-neutral-500/15 text-neutral-400 border-neutral-500/30",
  };
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status.replace("_", "-")}
    </span>
  );
}

function confidenceColor(confidence: number): string {
  if (confidence >= 80) return "text-emerald-400";
  if (confidence >= 60) return "text-lime-400";
  if (confidence >= 40) return "text-amber-400";
  return "text-neutral-400";
}

export function ConfidenceBadge({ confidence }: { confidence: number }) {
  return <span className={`font-semibold ${confidenceColor(confidence)}`}>{confidence}%</span>;
}

export function ImportanceBadge({ importance }: { importance: number }) {
  return (
    <span className="text-neutral-300">
      {importance}<span className="text-neutral-500">/10</span>
    </span>
  );
}
