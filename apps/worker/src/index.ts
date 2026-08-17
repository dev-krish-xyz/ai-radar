import { env, isTelegramConfigured, pingTelegram } from "@ai-radar/shared";
import { runTick, pipelineHealth } from "./scheduler";

const TICK_INTERVAL_MS = 60_000;
const once = process.argv.includes("--once");

async function startupChecks(): Promise<void> {
  console.log("[worker] startup checks…");

  // DB
  try {
    const health = await pipelineHealth();
    const lastCrawlIso = health.lastCrawlAt
      ? health.lastCrawlAt instanceof Date
        ? health.lastCrawlAt.toISOString()
        : String(health.lastCrawlAt)
      : "never";
    console.log(
      `[worker] db ok — providers=${health.providersEnabled} sources=${health.sourcesEnabled} ` +
        `inError=${health.sourcesInError} uncorrelated=${health.signalsUncorrelated} ` +
        `unalertedReady=${health.eventsUnalertedMeetingBar} lastCrawl=${lastCrawlIso}`,
    );
    if (health.sourcesEnabled === 0) {
      console.error("[worker] WARNING: zero enabled sources — run `bun run db:seed`");
    }
    if (health.lastCrawlAt) {
      const t = health.lastCrawlAt instanceof Date ? health.lastCrawlAt.getTime() : new Date(health.lastCrawlAt).getTime();
      const ageMin = (Date.now() - t) / 60_000;
      if (Number.isFinite(ageMin) && ageMin > 120) {
        console.error(
          `[worker] WARNING: last crawl was ${Math.round(ageMin)} minutes ago — worker may have been down`,
        );
      }
    }
  } catch (err) {
    console.error("[worker] FATAL: database unreachable — is Postgres up? (`docker compose up -d`)", err);
    throw err;
  }

  // Telegram
  if (!isTelegramConfigured()) {
    console.error(
      "[worker] WARNING: Telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID) — alerts will be skipped",
    );
  } else {
    const ping = await pingTelegram();
    if (ping.ok) {
      console.log("[worker] telegram bot reachable");
    } else {
      console.error(`[worker] WARNING: telegram getMe failed: ${ping.error ?? ping.status}`);
    }
  }

  // LLM optional
  if (!env.groqApiKey) {
    console.warn("[worker] GROQ_API_KEY not set — semantic LLM classification disabled");
  } else {
    console.log("[worker] GROQ_API_KEY present (LLM fallback enabled)");
  }

  // GitHub
  if (env.githubToken) {
    console.log("[worker] GITHUB_TOKEN present — Tags/commits API + rising-repo search");
  } else {
    console.log(
      "[worker] GITHUB_TOKEN not set — tags.atom for releases; rising-repo search is unauth (10 req/min, flaky). Set GITHUB_TOKEN.",
    );
  }
}

async function main(): Promise<void> {
  console.log(`[worker] starting${once ? " (--once)" : ""}`);
  await startupChecks();
  await runTick();

  if (once) {
    process.exit(0);
  }

  setInterval(() => {
    runTick().catch((err) => console.error("[worker] tick failed:", err));
  }, TICK_INTERVAL_MS);

  console.log(`[worker] looping every ${TICK_INTERVAL_MS / 1000}s`);
}

await main();
