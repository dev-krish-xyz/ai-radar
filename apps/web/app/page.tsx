import Link from "next/link";
import { api } from "@/lib/api";
import { EventCard } from "@/components/EventCard";

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
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium text-neutral-100">Updates</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            Same feed as Telegram — models, leaks, repos, papers.
          </p>
        </div>
        {health && (
          <div className={`text-xs ${health.staleWorker ? "text-amber-400" : "text-neutral-500"}`}>
            {health.lastCrawlAgeMinutes === null
              ? "No crawl yet"
              : health.staleWorker
                ? `Crawl stale · ${health.lastCrawlAgeMinutes}m ago`
                : `Crawled ${health.lastCrawlAgeMinutes}m ago`}
            {health.sourcesInError > 0 ? ` · ${health.sourcesInError} source errors` : ""}
          </div>
        )}
      </div>

      <div className="mb-4 flex gap-2">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.label}
            href={tab.value ? `/?status=${tab.value}` : "/"}
            className={`rounded-full px-3 py-1 text-sm ${
              status === tab.value
                ? "bg-neutral-100 text-neutral-900"
                : "bg-neutral-900 text-neutral-400 hover:text-neutral-100"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {events.length === 0 ? (
        <p className="text-neutral-500">
          No events yet. GitHub Actions crawls every 5 minutes into Neon — this page reads that
          same database.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {events.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      )}
    </div>
  );
}
