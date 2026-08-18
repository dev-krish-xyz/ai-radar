"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const links = [
  { href: "/", label: "Events", match: (p: string) => p === "/" || p.startsWith("/events") },
  { href: "/signals", label: "Signals", match: (p: string) => p.startsWith("/signals") },
  { href: "/providers", label: "Sources", match: (p: string) => p.startsWith("/providers") },
];

function Icon({ name, active }: { name: "events" | "signals" | "sources"; active: boolean }) {
  const stroke = active ? "currentColor" : "currentColor";
  if (name === "events") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7">
        <rect x="4" y="5" width="16" height="14" rx="2.5" />
        <path strokeLinecap="round" d="M8 9.5h8M8 13h5" />
      </svg>
    );
  }
  if (name === "signals") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7">
        <path strokeLinecap="round" d="M4 14v-1M8 16V8M12 18V6M16 15V9M20 13v-2" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7">
      <rect x="4.5" y="4.5" width="6.2" height="6.2" rx="1.2" />
      <rect x="13.3" y="4.5" width="6.2" height="6.2" rx="1.2" />
      <rect x="4.5" y="13.3" width="6.2" height="6.2" rx="1.2" />
      <rect x="13.3" y="13.3" width="6.2" height="6.2" rx="1.2" />
    </svg>
  );
}

const icons = { "/": "events", "/signals": "signals", "/providers": "sources" } as const;

export function Nav() {
  const pathname = usePathname();

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-border bg-[var(--toolbar)] pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-11 w-full max-w-[680px] items-center justify-between gap-3 px-4 sm:h-12 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className="shrink-0 text-[15px] font-semibold tracking-[-0.015em] text-text sm:text-[13px] sm:tracking-[-0.01em]"
            >
              AI Radar
            </Link>
            <nav className="hidden items-center gap-0.5 sm:flex">
              {links.map((l) => {
                const active = l.match(pathname);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`rounded-[6px] px-2 py-[4px] text-[13px] transition ${
                      active ? "bg-fill text-text" : "text-text-secondary hover:bg-bg-hover hover:text-text"
                    }`}
                  >
                    {l.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-[var(--toolbar)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 sm:hidden">
        <div className="grid h-[52px] grid-cols-3">
          {links.map((l) => {
            const active = l.match(pathname);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                  active ? "text-accent-text" : "text-text-tertiary"
                }`}
              >
                <Icon name={icons[l.href as keyof typeof icons]} active={active} />
                {l.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
