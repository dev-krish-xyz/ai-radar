import { api } from "@/lib/api";
import { Group, PageHeader } from "@/components/Group";
import { relativeTime } from "@/lib/time";
import { hostOf, labelFor } from "@/lib/labels";

export default async function ProvidersPage() {
  const providers = await api.providers().catch(() => []);

  return (
    <div className="min-w-0">
      <PageHeader title="Sources" subtitle="What the crawler watches." />
      <div className="flex flex-col gap-5">
        {providers.map((p) => (
          <section key={p.id} className="min-w-0">
            <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-0.5">
              <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-text">{p.name}</h2>
              <span className="text-[11px] text-text-tertiary">{labelFor(p.tier)}</span>
              {!p.enabled && <span className="text-[11px] text-text-tertiary">Off</span>}
            </div>
            <Group>
              <div className="divide-y divide-border">
                {p.sources.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-start justify-between gap-3 px-3 py-3 sm:items-center sm:gap-4 sm:px-3.5 sm:py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-[13px] text-text active:text-accent-text sm:hover:text-accent-text"
                      >
                        {s.name}
                      </a>
                      <div className="truncate text-[11px] text-text-tertiary">
                        {labelFor(s.type)} · {hostOf(s.url)} · every {s.crawlIntervalMinutes}m
                      </div>
                    </div>
                    <div className="max-w-[38%] shrink-0 text-right text-[11px] tabular-nums text-text-tertiary sm:max-w-none">
                      <div>{s.lastCrawledAt ? relativeTime(s.lastCrawledAt) : "Never"}</div>
                      <div
                        className={`truncate ${s.lastStatus?.startsWith("ok") ? "text-emerald" : "text-amber"}`}
                      >
                        {s.lastStatus ?? "—"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Group>
          </section>
        ))}
      </div>
    </div>
  );
}
