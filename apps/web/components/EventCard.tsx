import Link from "next/link";
import type { EventListItem } from "@/lib/api";
import { StatusBadge } from "./Badges";
import { relativeTime } from "@/lib/time";
import { labelFor } from "@/lib/labels";

export function EventCard({ event }: { event: EventListItem }) {
  return (
    <Link
      href={`/events/${event.id}`}
      className="flex min-h-14 items-start justify-between gap-3 px-3 py-3 active:bg-bg-active sm:min-h-0 sm:gap-4 sm:px-3.5 sm:py-2.5 sm:hover:bg-bg-hover"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] text-text-tertiary">
          {event.provider.name}
          <span> · {labelFor(event.type)}</span>
        </div>
        <div className="mt-0.5 line-clamp-2 break-words text-[15px] font-semibold tracking-[-0.012em] text-text sm:line-clamp-1 sm:text-[13px] sm:tracking-[-0.01em]">
          {event.entity ?? event.title}
        </div>
        {event.summary && (
          <p className="mt-0.5 line-clamp-2 break-words text-[13px] text-text-secondary sm:line-clamp-1 sm:text-[12px]">
            {event.summary}
          </p>
        )}
      </div>
      <div className="flex w-[4.75rem] shrink-0 flex-col items-end gap-1 pt-0.5 sm:w-auto">
        <span className="text-[11px] tabular-nums text-text-tertiary">
          {relativeTime(event.firstDetectedAt)}
        </span>
        <StatusBadge status={event.status} />
        {event.leadTimeMinutes !== null && (
          <span className="hidden text-[11px] text-emerald sm:inline">+{event.leadTimeMinutes}m lead</span>
        )}
      </div>
    </Link>
  );
}
