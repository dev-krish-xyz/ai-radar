"use client";

import { useState, useTransition, type MouseEvent } from "react";
import { toggleStar } from "@/app/actions";

export function StarButton({
  id,
  starred,
  onChange,
  size = 16,
}: {
  id: number;
  starred: boolean;
  onChange?: (starred: boolean) => void;
  size?: number;
}) {
  const [on, setOn] = useState(starred);
  const [pending, start] = useTransition();

  function flip(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !on;
    setOn(next);
    onChange?.(next);
    start(async () => {
      const res = await toggleStar(id, next);
      if (!res.ok) {
        setOn(!next);
        onChange?.(!next);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={flip}
      disabled={pending}
      aria-label={on ? "Unstar" : "Star and keep"}
      aria-pressed={on}
      className={`flex h-7 w-7 items-center justify-center rounded-full transition active:scale-90 ${
        on ? "text-amber" : "text-text-tertiary hover:text-text-secondary"
      }`}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <path
          d="M12 3.6 14.4 9l5.9.5-4.5 3.9 1.4 5.7L12 16.6 6.8 19.1l1.4-5.7L3.7 9.5 9.6 9 12 3.6Z"
          fill={on ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
