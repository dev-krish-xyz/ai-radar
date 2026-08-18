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
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            {event.provider.name}
            <span className="text-neutral-600"> · {event.type.replaceAll("_", " ")}</span>
          </div>
          <div className="mt-0.5 truncate text-base font-medium text-neutral-100">
            {event.entity ?? event.title}
          </div>
          {event.summary && (
            <p className="mt-1 line-clamp-2 text-sm text-neutral-400">{event.summary}</p>
          )}
        </div>
        <StatusBadge status={event.status} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <span>
          <ConfidenceBadge confidence={event.confidence} />
        </span>
        <span>
          <ImportanceBadge importance={event.importance} />
        </span>
        <span className="text-neutral-500">{relativeTime(event.firstDetectedAt)}</span>
        {event.alertedAt && <span className="text-sky-400/80">sent</span>}
        {event.wouldAlert && !event.alertedAt && <span className="text-amber-400/80">ready</span>}
        {event.leadTimeMinutes !== null && (
          <span className="text-emerald-400/80">lead {event.leadTimeMinutes}m</span>
        )}
      </div>
    </Link>
  );
}
