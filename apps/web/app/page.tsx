import Link from "next/link";
import { api } from "@/lib/api";
import { EventCard } from "@/components/EventCard";
import { Group, PageHeader } from "@/components/Group";

const STATUS_TABS = [
  { value: undefined, label: "All" },
  { value: "PRE_ANNOUNCEMENT", label: "Early" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "DISMISSED", label: "Dismissed" },
] as const;

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const [events, health] = await Promise.all([
    api.events({ status }).catch(() => []),
    api.health().catch(() => null),
  ]);

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
            <Link
              key={tab.label}
              href={tab.value ? `/?status=${tab.value}` : "/"}
              className={`flex min-h-8 flex-1 items-center justify-center rounded-[6px] px-2 text-[12px] font-medium leading-none transition sm:flex-none sm:px-3 ${
                active
                  ? "bg-surface text-text shadow-[var(--shadow-control)]"
                  : "text-text-secondary active:text-text sm:hover:text-text"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {events.length === 0 ? (
        <p className="px-2 py-10 text-center text-[13px] text-text-secondary">
          No events yet. The crawler writes to Neon every few minutes.
        </p>
      ) : (
        <Group>
          <div className="divide-y divide-border">
            {events.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </Group>
      )}
    </div>
  );
}
