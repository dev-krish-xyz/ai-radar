"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const links = [
  { href: "/", label: "Events", match: (p: string) => p === "/" || p.startsWith("/events") },
  { href: "/signals", label: "Signals", match: (p: string) => p.startsWith("/signals") },
  { href: "/providers", label: "Sources", match: (p: string) => p.startsWith("/providers") },
];

function Icon({ name }: { name: "events" | "signals" | "sources" }) {
  if (name === "events") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="4" y="5" width="16" height="14" rx="2.5" />
        <path strokeLinecap="round" d="M8 9.5h8M8 13h5" />
      </svg>
    );
  }
  if (name === "signals") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path strokeLinecap="round" d="M4 14v-1M8 16V8M12 18V6M16 15V9M20 13v-2" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="4.5" y="4.5" width="6.2" height="6.2" rx="1.2" />
      <rect x="13.3" y="4.5" width="6.2" height="6.2" rx="1.2" />
      <rect x="4.5" y="13.3" width="6.2" height="6.2" rx="1.2" />
      <rect x="13.3" y="13.3" width="6.2" height="6.2" rx="1.2" />
    </svg>
  );
}

const icons = { "/": "events", "/signals": "signals", "/providers": "sources" } as const;

function BottomTabGlyph({
  name,
  pressed,
}: {
  name: "events" | "signals" | "sources";
  pressed: boolean;
}) {
  const { pending } = useLinkStatus();
  const down = pressed || pending;
  return (
    <span
      className={`flex h-7 w-[52px] items-center justify-center rounded-[9px] transition-transform duration-100 ease-out ${
        down ? "scale-90 bg-fill" : "scale-100"
      } ${pending ? "opacity-70" : ""}`}
    >
      <Icon name={name} />
    </span>
  );
}

function BottomTab({
  href,
  label,
  active,
}: {
  href: "/" | "/signals" | "/providers";
  label: string;
  active: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  const down = () => setPressed(true);
  const up = () => setPressed(false);

  return (
    <Link
      href={href}
      onTouchStart={down}
      onTouchEnd={up}
      onTouchCancel={up}
      onMouseDown={down}
      onMouseUp={up}
      onMouseLeave={up}
      className={`relative flex h-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium select-none ${
        active || pressed ? "text-accent-text" : "text-text-tertiary"
      }`}
    >
      <BottomTabGlyph name={icons[href]} pressed={pressed} />
      {label}
    </Link>
  );
}

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="shrink-0 border-b border-border bg-[var(--toolbar)] pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-11 w-full max-w-[680px] items-center justify-between gap-3 px-4 sm:h-12 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className="shrink-0 text-[15px] font-semibold tracking-[-0.015em] text-text active:opacity-60 sm:text-[13px] sm:tracking-[-0.01em]"
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
                    className={`rounded-[6px] px-2 py-[4px] text-[13px] transition active:scale-95 ${
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

      <div className="mx-auto flex min-h-0 w-full max-w-[680px] flex-1 flex-col overflow-hidden px-4 pt-5 sm:px-5 sm:pt-6">
        <div key={pathname} className="page-enter flex min-h-0 flex-1 flex-col">
          {children}
        </div>
      </div>

      <nav className="shrink-0 border-t border-border bg-[var(--toolbar)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 sm:hidden">
        <div className="grid h-[52px] grid-cols-3">
          {links.map((l) => (
            <BottomTab
              key={l.href}
              href={l.href as "/" | "/signals" | "/providers"}
              label={l.label}
              active={l.match(pathname)}
            />
          ))}
        </div>
      </nav>
    </div>
  );
}
