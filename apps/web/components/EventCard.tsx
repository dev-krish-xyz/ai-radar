import Link from "next/link";
import type { EventListItem } from "@/lib/api";
import { StatusBadge, ConfidenceBadge, ImportanceBadge } from "./Badges";
import { relativeTime } from "@/lib/time";

export function EventCard({ event }: { event: EventListItem }) {
  return (
    <Link
      href={`/events/${event.id}`}
      className="block rounded-xl border border-border bg-bg p-4 shadow-[var(--shadow)] transition hover:border-border-strong hover:shadow-[var(--shadow-hover)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
            {event.provider.name}
            <span className="text-text-tertiary/70"> · {event.type.replaceAll("_", " ")}</span>
          </div>
          <div className="mt-1 truncate text-base font-semibold text-text">
            {event.entity ?? event.title}
          </div>
          {event.summary && (
            <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{event.summary}</p>
          )}
        </div>
        <StatusBadge status={event.status} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <ConfidenceBadge confidence={event.confidence} />
        <ImportanceBadge importance={event.importance} />
        <span className="text-text-tertiary">{relativeTime(event.firstDetectedAt)}</span>
        {event.alertedAt && <span className="text-sky">sent</span>}
        {event.wouldAlert && !event.alertedAt && <span className="text-amber">ready</span>}
        {event.leadTimeMinutes !== null && (
          <span className="text-emerald">lead {event.leadTimeMinutes}m</span>
        )}
      </div>
    </Link>
  );
}
