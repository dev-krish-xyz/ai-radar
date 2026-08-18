"use server";

import { revalidatePath } from "next/cache";
import { deleteEventById, setEventStarred } from "@/lib/data";

export async function toggleStar(id: number, starred: boolean): Promise<{ ok: boolean }> {
  const ok = await setEventStarred(id, starred);
  revalidatePath("/");
  revalidatePath(`/events/${id}`);
  return { ok };
}

export async function removeEvent(id: number): Promise<{ ok: boolean }> {
  const ok = await deleteEventById(id);
  revalidatePath("/");
  revalidatePath("/signals");
  return { ok };
}
