/** Hard cap so classify + enrich cannot burn the Groq daily token quota on junk. */
export const GROQ_MAX_CALLS_PER_TICK = 6;

let callsThisTick = 0;
let paused = false;

export function resetGroqTickBudget(): void {
  callsThisTick = 0;
  paused = false;
}

export function groqBudgetRemaining(): number {
  if (paused) return 0;
  return Math.max(0, GROQ_MAX_CALLS_PER_TICK - callsThisTick);
}

export function canCallGroq(): boolean {
  return !paused && callsThisTick < GROQ_MAX_CALLS_PER_TICK;
}

export function noteGroqCall(): void {
  callsThisTick += 1;
}

export function pauseGroqForTick(reason: string): void {
  paused = true;
  console.warn(`[groq] paused for this tick: ${reason}`);
}

export function isGroqRateLimit(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const rec = err as { status?: number; message?: string };
  if (rec.status === 429) return true;
  return typeof rec.message === "string" && rec.message.includes("429");
}
