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
    <span
      className={`inline-flex h-[18px] items-center rounded-full px-1.5 text-[11px] font-medium leading-none ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: number }) {
  const color =
    confidence >= 80
      ? "text-emerald"
      : confidence >= 60
        ? "text-accent-text"
        : confidence >= 40
          ? "text-amber"
          : "text-text-tertiary";
  return <span className={`tabular-nums ${color}`}>{confidence}%</span>;
}

export function ImportanceBadge({ importance }: { importance: number }) {
  return (
    <span className="tabular-nums text-text">
      {importance}
      <span className="text-text-tertiary">/10</span>
    </span>
  );
}
