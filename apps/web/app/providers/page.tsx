import { api } from "@/lib/api";
import { relativeTime } from "@/lib/time";

export default async function ProvidersPage() {
  const providers = await api.providers().catch(() => []);

  return (
    <div>
      <h1 className="mb-4 text-lg font-medium text-neutral-100">Providers</h1>
      <div className="flex flex-col gap-4">
        {providers.map((p) => (
          <div key={p.id} className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
            <div className="flex items-center gap-2">
              <span className="font-medium text-neutral-100">{p.name}</span>
              <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-xs text-neutral-400">
                {p.tier}
              </span>
              {!p.enabled && (
                <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-xs text-neutral-500">
                  disabled
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-col divide-y divide-neutral-800 text-sm">
              {p.sources.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-4 py-2">
                  <div className="min-w-0">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-neutral-200 hover:underline"
                    >
                      {s.name}
                    </a>
                    <div className="text-xs text-neutral-500">
                      {s.type} · every {s.crawlIntervalMinutes}m
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs text-neutral-500">
                    <div>{s.lastCrawledAt ? relativeTime(s.lastCrawledAt) : "never crawled"}</div>
                    <div className={s.lastStatus?.startsWith("ok") ? "text-emerald-400/80" : "text-amber-400/80"}>
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
