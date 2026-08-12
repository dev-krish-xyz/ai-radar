import Link from "next/link";

const links = [
  { href: "/", label: "Events" },
  { href: "/signals", label: "Live Signals" },
  { href: "/providers", label: "Providers" },
];

export function Nav() {
  return (
    <header className="border-b border-neutral-800">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
        <span className="font-semibold text-neutral-100">AI Release Radar</span>
        <nav className="flex gap-4 text-sm text-neutral-400">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-neutral-100">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
