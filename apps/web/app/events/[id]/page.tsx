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
      <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-text-tertiary">
        {event.provider.name}
      </div>
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-text">{event.title}</h1>
        <StatusBadge status={event.status} />
      </div>

      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-text-secondary">{event.summary}</p>

      <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 rounded-xl border border-border bg-bg-inset p-4 text-sm">
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
            <span className="text-emerald">{event.leadTimeMinutes} minutes</span>
          </Stat>
        )}
        <Stat label="Alerted">{event.alertedAt ? formatDateTime(event.alertedAt) : "not yet"}</Stat>
      </div>

      <h2 className="mb-3 mt-10 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
        Evidence timeline ({event.evidence.length})
      </h2>
      <div className="flex flex-col gap-3">
        {event.evidence.map((ev) => (
          <div key={ev.id} className="rounded-xl border border-border bg-bg p-4 shadow-[var(--shadow)]">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
                  {ev.signalType} · +{ev.confidenceContribution} confidence
                </div>
                <div className="mt-0.5 text-sm font-semibold text-text">{ev.title}</div>
                <p className="mt-1 text-sm text-text-secondary">{ev.description}</p>
              </div>
              <div className="shrink-0 text-right text-xs text-text-tertiary">{relativeTime(ev.detectedAt)}</div>
            </div>
            <a
              href={ev.source.url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-xs text-text-tertiary hover:text-accent-text hover:underline"
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
      <div className="text-xs text-text-tertiary">{label}</div>
      <div className="mt-0.5 text-text">{children}</div>
    </div>
  );
}
