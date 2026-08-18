"use client";

import { useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import type { EventListItem, EventStatus } from "@/lib/api";
import { EventCard } from "@/components/EventCard";
import { Group, PageHeader } from "@/components/Group";

type Health = {
  lastCrawlAgeMinutes: number | null;
  staleWorker: boolean;
  sourcesInError: number;
};

type Filter = EventStatus | "STARRED" | undefined;

const STATUS_TABS: { value: Filter; label: string }[] = [
  { value: undefined, label: "All" },
  { value: "PRE_ANNOUNCEMENT", label: "Early" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "DISMISSED", label: "Dismissed" },
  { value: "STARRED", label: "Starred" },
];

function parseFilter(value: string | null | undefined): Filter {
  if (value === "STARRED") return "STARRED";
  if (value === "PRE_ANNOUNCEMENT" || value === "CONFIRMED" || value === "DISMISSED") return value;
  return undefined;
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function groupByDay(events: EventListItem[]): EventListItem[][] {
  const groups: EventListItem[][] = [];
  for (const event of events) {
    const key = dayKey(event.firstDetectedAt);
    const last = groups[groups.length - 1];
    if (last && dayKey(last[0].firstDetectedAt) === key) last.push(event);
    else groups.push([event]);
  }
  return groups;
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
  const listRef = useRef<HTMLDivElement>(null);
  const lastY = useRef(0);
  const [compact, setCompact] = useState(false);
  const [items, setItems] = useState(events);
  const [filter, setFilter] = useState<Filter>(() => parseFilter(initialStatus));

  useEffect(() => {
    setItems(events);
  }, [events]);

  useEffect(() => {
    function sync() {
      setFilter(parseFilter(new URLSearchParams(window.location.search).get("status")));
    }
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  function select(next: Filter) {
    setFilter(next);
    const url = next ? `/?status=${next}` : "/";
    window.history.replaceState(window.history.state, "", url);
    setCompact(false);
    lastY.current = 0;
    listRef.current?.scrollTo({ top: 0 });
  }

  function onScroll(e: UIEvent<HTMLDivElement>) {
    const y = e.currentTarget.scrollTop;
    const dy = y - lastY.current;
    lastY.current = y;
    if (y < 20) {
      setCompact(false);
      return;
    }
    if (dy > 6) setCompact(true);
    else if (dy < -6) setCompact(false);
  }

  const visible = useMemo(() => {
    if (filter === "STARRED") return items.filter((e) => e.starred);
    if (filter) return items.filter((e) => e.status === filter);
    return items;
  }, [items, filter]);

  const groups = useMemo(() => groupByDay(visible), [visible]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="shrink-0 bg-bg">
        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            compact ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
          }`}
        >
          <div className="overflow-hidden">
            <div className={`transition-opacity duration-200 ${compact ? "opacity-0" : "opacity-100"}`}>
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
            </div>
          </div>
        </div>

        <div className="pb-3">
          <div className="flex w-full rounded-[8px] bg-fill p-[2px] sm:inline-flex sm:w-auto">
            {STATUS_TABS.map((tab) => {
              const active = filter === tab.value;
              return (
                <button
                  key={tab.label}
                  type="button"
                  onClick={() => select(tab.value)}
                  className={`flex min-h-8 flex-1 items-center justify-center rounded-[6px] px-1.5 text-[12px] font-medium leading-none transition active:scale-[0.97] sm:flex-none sm:px-3 ${
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
        </div>
      </div>

      <div
        ref={listRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6 [-webkit-overflow-scrolling:touch]"
      >
        {visible.length === 0 ? (
          <p className="px-2 py-10 text-center text-[13px] text-text-secondary">
            {items.length === 0
              ? "No events yet. The crawler writes to Neon every few minutes."
              : filter === "STARRED"
                ? "Nothing starred. Star a card to keep it past 4 days."
                : "Nothing in this view."}
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {groups.map((group) => (
              <Group key={dayKey(group[0].firstDetectedAt)}>
                <div className="divide-y divide-border">
                  {group.map((e) => (
                    <EventCard
                      key={e.id}
                      event={e}
                      onStarredChange={(id, starred) =>
                        setItems((prev) => prev.map((item) => (item.id === id ? { ...item, starred } : item)))
                      }
                    />
                  ))}
                </div>
              </Group>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
