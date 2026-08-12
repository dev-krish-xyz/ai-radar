import Link from "next/link";
import { api } from "@/lib/api";
import { EventCard } from "@/components/EventCard";

const STATUS_TABS = [
  { value: undefined, label: "All" },
  { value: "PRE_ANNOUNCEMENT", label: "Pre-Announcement" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "DISMISSED", label: "Dismissed" },
] as const;

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const events = await api.events({ status }).catch(() => []);

  return (
    <div>
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
        <p className="text-neutral-500">No events yet. The worker builds these up as sources are crawled.</p>
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
