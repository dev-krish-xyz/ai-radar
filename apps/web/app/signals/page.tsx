import { api } from "@/lib/api";
import { Group, PageHeader } from "@/components/Group";
import { relativeTime } from "@/lib/time";
import { labelFor } from "@/lib/labels";

export default async function SignalsPage() {
  const signals = await api.signals({ limit: 100 }).catch(() => []);

  return (
    <div className="min-w-0">
      <PageHeader title="Signals" subtitle="Raw detections before they become events." />
      {signals.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-text-secondary">No signals yet.</p>
      ) : (
        <Group>
          <div className="divide-y divide-border">
            {signals.map((s) => (
              <div
                key={s.id}
                className="flex items-start justify-between gap-3 px-3 py-3 sm:gap-4 sm:px-3.5 sm:py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] text-text-tertiary">
                    {s.provider.name} · {s.source.name}
                  </div>
                  <div className="mt-0.5 line-clamp-2 break-words text-[15px] text-text sm:line-clamp-1 sm:text-[13px]">
                    {s.title}
                  </div>
                  <div className="mt-0.5 text-[11px] text-text-tertiary">{labelFor(s.signalType)}</div>
                </div>
                <div className="w-[4.5rem] shrink-0 text-right text-[11px] tabular-nums text-text-tertiary sm:w-auto">
                  <div>{relativeTime(s.detectedAt)}</div>
                  <div className={s.correlated ? "text-text-tertiary" : "text-emerald"}>
                    {s.correlated ? "Linked" : "Open"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Group>
      )}
    </div>
  );
}
