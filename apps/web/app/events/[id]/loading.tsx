export default function Loading() {
  return (
    <div className="page-enter min-h-0 min-w-0 flex-1 overflow-hidden pt-1">
      <div className="skeleton mb-4 h-3 w-14 rounded-full" />
      <div className="skeleton mb-2 h-3 w-16 rounded-full" />
      <div className="skeleton mb-3 h-6 w-[78%] rounded-full" />
      <div className="skeleton mb-6 h-3 w-full rounded-full" />
      <div className="overflow-hidden rounded-[10px] bg-surface ring-1 ring-border">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center justify-between px-3.5 py-2.5">
            <div className="skeleton h-3 w-16 rounded-full" />
            <div className="skeleton h-3 w-24 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
