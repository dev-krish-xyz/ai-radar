import Link from "next/link";
import type { EventListItem } from "@/lib/api";
import { StatusBadge, ConfidenceBadge, ImportanceBadge } from "./Badges";
import { relativeTime } from "@/lib/time";

export function EventCard({ event }: { event: EventListItem }) {
  return (
    <Link
      href={`/events/${event.id}`}
      className="block rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 transition hover:border-neutral-700 hover:bg-neutral-900"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-neutral-500">{event.provider.name}</div>
          <div className="mt-0.5 truncate text-base font-medium text-neutral-100">{event.title}</div>
        </div>
        <StatusBadge status={event.status} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <span>
          Confidence: <ConfidenceBadge confidence={event.confidence} />
        </span>
        <span>
          Importance: <ImportanceBadge importance={event.importance} />
        </span>
        <span className="text-neutral-500">
          {event.signalCount} signal{event.signalCount === 1 ? "" : "s"}
        </span>
        <span className="text-neutral-500">First detected {relativeTime(event.firstDetectedAt)}</span>
        {event.leadTimeMinutes !== null && (
          <span className="text-emerald-400/80">Lead time: {event.leadTimeMinutes}m</span>
        )}
      </div>
    </Link>
  );
}
