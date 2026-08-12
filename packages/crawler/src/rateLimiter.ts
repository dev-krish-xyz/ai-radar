const lastRequestAtByHost = new Map<string, number>();

/** Minimum gap enforced between two requests to the same host, regardless of source cadence. */
const MIN_GAP_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Serializes and paces requests per-host so we never hammer a provider's infrastructure. */
export async function waitForHostSlot(url: string): Promise<void> {
  const host = new URL(url).host;
  const last = lastRequestAtByHost.get(host) ?? 0;
  const elapsed = Date.now() - last;
  if (elapsed < MIN_GAP_MS) {
    await sleep(MIN_GAP_MS - elapsed);
  }
  lastRequestAtByHost.set(host, Date.now());
}
