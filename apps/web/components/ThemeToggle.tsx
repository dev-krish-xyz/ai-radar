"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
  }, []);

  function choose(next: Theme) {
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("appearance", next);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", next === "dark" ? "#1c1c1e" : "#f5f5f7");
    setTheme(next);
  }

  return (
    <div
      className="inline-flex shrink-0 rounded-[7px] bg-fill p-[2px]"
      role="radiogroup"
      aria-label="Appearance"
    >
      {(["light", "dark"] as const).map((value) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => choose(value)}
            className={`min-h-[28px] rounded-[5px] px-2.5 text-[12px] font-medium leading-none transition sm:min-h-0 sm:py-[3px] ${
              active
                ? "bg-surface text-text shadow-[var(--shadow-control)]"
                : "text-text-secondary hover:text-text"
            }`}
          >
            {value === "light" ? "Light" : "Dark"}
          </button>
        );
      })}
    </div>
  );
}
