import { api } from "@/lib/api";
import { relativeTime } from "@/lib/time";

export default async function SignalsPage() {
  const signals = await api.signals({ limit: 100 }).catch(() => []);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-text">Live Signals</h1>
      {signals.length === 0 ? (
        <p className="text-text-secondary">No signals detected yet.</p>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-bg shadow-[var(--shadow)]">
          {signals.map((s) => (
            <div key={s.id} className="flex items-start justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <div className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
                  {s.provider.name} · {s.source.name}
                </div>
                <div className="mt-0.5 text-sm text-text">{s.title}</div>
                <div className="mt-0.5 text-xs text-text-tertiary">{s.signalType}</div>
              </div>
              <div className="shrink-0 text-right text-xs text-text-tertiary">
                <div>{relativeTime(s.detectedAt)}</div>
                <div className={s.correlated ? "text-text-tertiary" : "text-emerald"}>
                  {s.correlated ? "correlated" : "pending"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
