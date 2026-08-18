"use client";

import { useEffect, useMemo, useState } from "react";
import type { EventListItem, EventStatus } from "@/lib/api";
import { EventCard } from "@/components/EventCard";
import { Group, PageHeader } from "@/components/Group";

type Health = {
  lastCrawlAgeMinutes: number | null;
  staleWorker: boolean;
  sourcesInError: number;
};

const STATUS_TABS = [
  { value: undefined, label: "All" },
  { value: "PRE_ANNOUNCEMENT", label: "Early" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "DISMISSED", label: "Dismissed" },
] as const;

const STATUSES = new Set<EventStatus>(["PRE_ANNOUNCEMENT", "CONFIRMED", "DISMISSED"]);

function parseStatus(value: string | null | undefined): EventStatus | undefined {
  if (value && STATUSES.has(value as EventStatus)) return value as EventStatus;
  return undefined;
}

export function EventsFeed({
  events,
  health,
  initialStatus,
}: {
  events: EventListItem[];
  health: Health | null;
  initialStatus?: string;
}) {
  const [status, setStatus] = useState<EventStatus | undefined>(() => parseStatus(initialStatus));

  useEffect(() => {
    function sync() {
      setStatus(parseStatus(new URLSearchParams(window.location.search).get("status")));
    }
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  function select(next: EventStatus | undefined) {
    setStatus(next);
    const url = next ? `/?status=${next}` : "/";
    window.history.replaceState(window.history.state, "", url);
  }

  const visible = useMemo(
    () => (status ? events.filter((e) => e.status === status) : events),
    [events, status],
  );

  return (
    <div className="min-w-0">
      <PageHeader
        title="Updates"
        subtitle="Models, leaks, repos, papers — same feed as Telegram."
        trailing={
          health ? (
            <p
              className={`text-[11px] tabular-nums ${health.staleWorker ? "text-amber" : "text-text-tertiary"}`}
            >
              {health.lastCrawlAgeMinutes === null
                ? "No crawl yet"
                : health.staleWorker
                  ? `Stale · ${health.lastCrawlAgeMinutes}m`
                  : `Updated ${health.lastCrawlAgeMinutes}m ago`}
              {health.sourcesInError > 0 ? ` · ${health.sourcesInError} errors` : ""}
            </p>
          ) : null
        }
      />

      <div className="mb-4 flex w-full rounded-[8px] bg-fill p-[2px] sm:inline-flex sm:w-auto">
        {STATUS_TABS.map((tab) => {
          const active = status === tab.value;
          return (
            <button
              key={tab.label}
              type="button"
              onClick={() => select(tab.value)}
              className={`flex min-h-8 flex-1 items-center justify-center rounded-[6px] px-2 text-[12px] font-medium leading-none transition sm:flex-none sm:px-3 ${
                active
                  ? "bg-surface text-text shadow-[var(--shadow-control)]"
                  : "text-text-secondary hover:text-text"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className="px-2 py-10 text-center text-[13px] text-text-secondary">
          {events.length === 0
            ? "No events yet. The crawler writes to Neon every few minutes."
            : "Nothing in this view."}
        </p>
      ) : (
        <Group>
          <div className="divide-y divide-border">
            {visible.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </Group>
      )}
    </div>
  );
}
