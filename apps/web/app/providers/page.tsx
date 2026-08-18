import { api } from "@/lib/api";
import { relativeTime } from "@/lib/time";

export default async function ProvidersPage() {
  const providers = await api.providers().catch(() => []);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-text">Providers</h1>
      <div className="flex flex-col gap-4">
        {providers.map((p) => (
          <div key={p.id} className="rounded-xl border border-border bg-bg p-4 shadow-[var(--shadow)]">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-text">{p.name}</span>
              <span className="rounded-full bg-neutral-soft px-2 py-0.5 text-xs text-text-secondary">
                {p.tier}
              </span>
              {!p.enabled && (
                <span className="rounded-full bg-neutral-soft px-2 py-0.5 text-xs text-text-tertiary">
                  disabled
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-col divide-y divide-border text-sm">
              {p.sources.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-text hover:text-accent-text hover:underline"
                    >
                      {s.name}
                    </a>
                    <div className="text-xs text-text-tertiary">
                      {s.type} · every {s.crawlIntervalMinutes}m
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs text-text-tertiary">
                    <div>{s.lastCrawledAt ? relativeTime(s.lastCrawledAt) : "never crawled"}</div>
                    <div className={s.lastStatus?.startsWith("ok") ? "text-emerald" : "text-amber"}>
                      {s.lastStatus ?? "—"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
