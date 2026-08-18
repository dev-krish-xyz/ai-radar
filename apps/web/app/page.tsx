import { api } from "@/lib/api";
import { EventsFeed } from "@/components/EventsFeed";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const [events, health] = await Promise.all([
    api.events({ limit: 200 }).catch(() => []),
    api.health().catch(() => null),
  ]);

  return <EventsFeed events={events} health={health} initialStatus={status} />;
}
