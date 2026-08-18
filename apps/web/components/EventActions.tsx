"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { removeEvent } from "@/app/actions";
import { StarButton } from "./StarButton";

export function EventActions({ id, starred }: { id: number; starred: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onDelete() {
    if (!confirm("Delete this event and its evidence? This cannot be undone.")) return;
    start(async () => {
      const res = await removeEvent(id);
      if (res.ok) router.push("/");
    });
  }

  return (
    <div className="mt-3 flex items-center gap-3">
      <StarButton id={id} starred={starred} size={18} />
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        className="text-[13px] text-text-tertiary transition hover:text-amber"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
    </div>
  );
}
