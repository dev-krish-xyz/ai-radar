"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const links = [
  { href: "/", label: "Events" },
  { href: "/signals", label: "Live Signals" },
  { href: "/providers", label: "Providers" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-[15px] font-semibold tracking-tight text-text">
            AI Radar
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {links.map((l) => {
              const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`rounded-md px-2.5 py-1.5 transition ${
                    active
                      ? "bg-bg-hover text-text"
                      : "text-text-secondary hover:bg-bg-hover hover:text-text"
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
  );
}
