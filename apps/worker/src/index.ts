import { runTick } from "./scheduler";

const TICK_INTERVAL_MS = 60_000;
const once = process.argv.includes("--once");

async function main(): Promise<void> {
  console.log(`[worker] starting${once ? " (--once)" : ""}`);
  await runTick();

  if (once) {
    process.exit(0);
  }

  setInterval(() => {
    runTick().catch((err) => console.error("[worker] tick failed:", err));
  }, TICK_INTERVAL_MS);
}

await main();
