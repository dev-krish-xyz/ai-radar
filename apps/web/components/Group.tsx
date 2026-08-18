import type { ReactNode } from "react";

export function Group({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[10px] bg-surface shadow-[var(--shadow)] ring-1 ring-border">
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  trailing,
}: {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-1 sm:mb-5 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.022em] text-text">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-[13px] text-text-secondary">{subtitle}</p>}
      </div>
      {trailing ? <div className="shrink-0 sm:pb-0.5">{trailing}</div> : null}
    </div>
  );
}
