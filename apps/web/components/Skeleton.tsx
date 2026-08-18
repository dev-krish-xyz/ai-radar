export function ListSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <div className="page-enter overflow-hidden rounded-[10px] bg-surface shadow-[var(--shadow)] ring-1 ring-border">
      <div className="divide-y divide-border">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-start justify-between gap-3 px-3 py-3.5">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="skeleton h-2.5 w-28 rounded-full" />
              <div className="skeleton h-3.5 w-[72%] rounded-full" />
              <div className="skeleton h-2.5 w-[88%] rounded-full" />
            </div>
            <div className="flex w-12 shrink-0 flex-col items-end gap-2">
              <div className="skeleton h-2.5 w-8 rounded-full" />
              <div className="skeleton h-3.5 w-10 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PageSkeleton({ titleWidth = "w-28" }: { titleWidth?: string }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="shrink-0 pb-3">
        <div className={`skeleton mb-2 h-6 ${titleWidth} rounded-full`} />
        <div className="skeleton h-3 w-52 rounded-full" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <ListSkeleton />
      </div>
    </div>
  );
}
