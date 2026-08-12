import { api } from "@/lib/api";
import { relativeTime } from "@/lib/time";

export default async function SignalsPage() {
  const signals = await api.signals({ limit: 100 }).catch(() => []);

  return (
    <div>
      <h1 className="mb-4 text-lg font-medium text-neutral-100">Live Signals</h1>
      {signals.length === 0 ? (
        <p className="text-neutral-500">No signals detected yet.</p>
      ) : (
        <div className="flex flex-col divide-y divide-neutral-800 rounded-lg border border-neutral-800">
          {signals.map((s) => (
            <div key={s.id} className="flex items-start justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wide text-neutral-500">
                  {s.provider.name} · {s.source.name}
                </div>
                <div className="mt-0.5 text-sm text-neutral-200">{s.title}</div>
                <div className="mt-0.5 text-xs text-neutral-500">{s.signalType}</div>
              </div>
              <div className="shrink-0 text-right text-xs text-neutral-500">
                <div>{relativeTime(s.detectedAt)}</div>
                <div className={s.correlated ? "text-neutral-600" : "text-lime-400"}>
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
