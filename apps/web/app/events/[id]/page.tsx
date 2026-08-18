import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { StatusBadge, ConfidenceBadge, ImportanceBadge } from "@/components/Badges";
import { Group } from "@/components/Group";
import { formatDateTime, relativeTime } from "@/lib/time";
import { hostOf, labelFor } from "@/lib/labels";

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await api.event(Number(id)).catch(() => null);
  if (!event) notFound();

  const facts: { label: string; value: ReactNode }[] = [
    { label: "Status", value: <StatusBadge status={event.status} /> },
    { label: "Confidence", value: <ConfidenceBadge confidence={event.confidence} /> },
    { label: "Importance", value: <ImportanceBadge importance={event.importance} /> },
    { label: "Type", value: labelFor(event.type) },
  ];
  if (event.entity) facts.push({ label: "Entity", value: event.entity });
  facts.push({ label: "First seen", value: formatDateTime(event.firstDetectedAt) });
  if (event.officiallyAnnouncedAt) {
    facts.push({ label: "Announced", value: formatDateTime(event.officiallyAnnouncedAt) });
  }
  if (event.leadTimeMinutes !== null) {
    facts.push({
      label: "Lead",
      value: <span className="text-emerald">{event.leadTimeMinutes} minutes</span>,
    });
  }
  facts.push({
    label: "Alert",
    value: event.alertedAt ? formatDateTime(event.alertedAt) : "Not sent",
  });

  return (
    <div className="min-w-0">
      <Link
        href="/"
        className="mb-3 inline-flex min-h-8 items-center text-[13px] text-accent-text sm:mb-4"
      >
        Events
      </Link>

      <div className="text-[11px] text-text-tertiary">{event.provider.name}</div>
      <h1 className="mt-1 break-words text-[20px] font-semibold leading-snug tracking-[-0.022em] text-text sm:text-[22px]">
        {event.title}
      </h1>
      {event.summary && (
        <p className="mt-2 max-w-[40rem] break-words text-[15px] leading-relaxed text-text-secondary">
          {event.summary}
        </p>
      )}

      <div className="mt-5 sm:mt-6">
        <Group>
          <dl className="divide-y divide-border">
            {facts.map((f) => (
              <div
                key={f.label}
                className="flex items-start justify-between gap-3 px-3 py-2.5 sm:items-center sm:gap-6 sm:px-3.5 sm:py-2"
              >
                <dt className="shrink-0 text-[13px] text-text-secondary">{f.label}</dt>
                <dd className="min-w-0 break-words text-right text-[13px] text-text">{f.value}</dd>
              </div>
            ))}
          </dl>
        </Group>
      </div>

      <h2 className="mb-2 mt-7 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary sm:mt-8">
        Evidence · {event.evidence.length}
      </h2>
      <Group>
        <div className="divide-y divide-border">
          {event.evidence.map((ev) => (
            <div key={ev.id} className="px-3 py-3 sm:px-3.5">
              <div className="flex items-start justify-between gap-3 sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-text-tertiary">
                    {labelFor(ev.signalType)}
                    <span> · +{ev.confidenceContribution}</span>
                  </div>
                  <div className="mt-0.5 break-words text-[13px] font-semibold text-text">{ev.title}</div>
                  {ev.description && (
                    <p className="mt-0.5 break-words text-[12px] leading-relaxed text-text-secondary">
                      {ev.description}
                    </p>
                  )}
                </div>
                <div className="shrink-0 pt-0.5 text-[11px] tabular-nums text-text-tertiary">
                  {relativeTime(ev.detectedAt)}
                </div>
              </div>
              <a
                href={ev.source.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-block max-w-full break-words text-[12px] text-accent-text"
              >
                {ev.source.name}
                <span className="text-text-tertiary"> · {hostOf(ev.source.url)}</span>
              </a>
            </div>
          ))}
        </div>
      </Group>
    </div>
  );
}
