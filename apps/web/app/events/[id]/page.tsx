import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { StatusBadge, ConfidenceBadge, ImportanceBadge } from "@/components/Badges";
import { formatDateTime, relativeTime } from "@/lib/time";

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await api.event(Number(id)).catch(() => null);
  if (!event) notFound();

  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wide text-neutral-500">{event.provider.name}</div>
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-medium text-neutral-100">{event.title}</h1>
        <StatusBadge status={event.status} />
      </div>

      <p className="mt-3 max-w-2xl text-sm text-neutral-300">{event.summary}</p>

      <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 text-sm">
        <Stat label="Confidence">
          <ConfidenceBadge confidence={event.confidence} />
        </Stat>
        <Stat label="Importance">
          <ImportanceBadge importance={event.importance} />
        </Stat>
        <Stat label="Event Type">{event.type}</Stat>
        {event.entity && <Stat label="Entity">{event.entity}</Stat>}
        <Stat label="First Detected">{formatDateTime(event.firstDetectedAt)}</Stat>
        {event.officiallyAnnouncedAt && (
          <Stat label="Officially Announced">{formatDateTime(event.officiallyAnnouncedAt)}</Stat>
        )}
        {event.leadTimeMinutes !== null && (
          <Stat label="Lead Time">
            <span className="text-emerald-400">{event.leadTimeMinutes} minutes</span>
          </Stat>
        )}
        <Stat label="Alerted">{event.alertedAt ? formatDateTime(event.alertedAt) : "not yet"}</Stat>
      </div>

      <h2 className="mb-3 mt-8 text-sm font-medium uppercase tracking-wide text-neutral-500">
        Evidence timeline ({event.evidence.length})
      </h2>
      <div className="flex flex-col gap-3">
        {event.evidence.map((ev) => (
          <div key={ev.id} className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wide text-neutral-500">
                  {ev.signalType} · +{ev.confidenceContribution} confidence
                </div>
                <div className="mt-0.5 text-sm font-medium text-neutral-200">{ev.title}</div>
                <p className="mt-1 text-sm text-neutral-400">{ev.description}</p>
              </div>
              <div className="shrink-0 text-right text-xs text-neutral-500">{relativeTime(ev.detectedAt)}</div>
            </div>
            <a
              href={ev.source.url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-xs text-neutral-500 hover:text-neutral-300 hover:underline"
            >
              [{ev.source.type.toUpperCase()}] {ev.source.name} → {ev.source.url}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-neutral-200">{children}</div>
    </div>
  );
}
