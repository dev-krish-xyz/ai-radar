/**
 * Process supervisor for ai-radar long-lived services.
 *
 * Restarts crashed children with exponential backoff, logs clearly,
 * and shuts everything down cleanly on SIGINT/SIGTERM.
 *
 * Usage:
 *   bun run up              # worker + api
 *   bun run up -- --web     # worker + api + next dev
 *   bun run scripts/supervise.ts --worker-only
 */

import { type Subprocess, spawn } from "bun";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

interface ServiceSpec {
  name: string;
  cmd: string[];
  cwd?: string;
  /** Don't restart on clean exit code 0 when --once-like */
  restart: boolean;
}

const args = process.argv.slice(2);
const withWeb = args.includes("--web");
const workerOnly = args.includes("--worker-only");
const apiOnly = args.includes("--api-only");

function buildServices(): ServiceSpec[] {
  const services: ServiceSpec[] = [];
  if (!apiOnly) {
    services.push({
      name: "worker",
      cmd: ["bun", "run", "apps/worker/src/index.ts"],
      restart: true,
    });
  }
  if (!workerOnly) {
    services.push({
      name: "api",
      cmd: ["bun", "run", "apps/api/src/index.ts"],
      restart: true,
    });
  }
  if (withWeb) {
    services.push({
      name: "web",
      cmd: ["bun", "run", "dev"],
      cwd: resolve(ROOT, "apps/web"),
      restart: true,
    });
  }
  return services;
}

interface Running {
  spec: ServiceSpec;
  proc: Subprocess;
  restarts: number;
  backoffMs: number;
  stopping: boolean;
}

const running = new Map<string, Running>();
let shuttingDown = false;

const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;
/** If a process lives longer than this, reset backoff after crash. */
const STABLE_MS = 60_000;

function log(name: string, msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[supervise ${ts}] [${name}] ${msg}`);
}

function startService(spec: ServiceSpec, restarts = 0, backoffMs = MIN_BACKOFF_MS): void {
  if (shuttingDown) return;

  log(spec.name, `starting: ${spec.cmd.join(" ")}`);
  const startedAt = Date.now();

  const proc = spawn({
    cmd: spec.cmd,
    cwd: spec.cwd ?? ROOT,
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env },
    onExit(_proc, exitCode, signalCode, error) {
      const livedMs = Date.now() - startedAt;
      const entry = running.get(spec.name);
      if (!entry || entry.stopping || shuttingDown) {
        log(spec.name, `exited (shutdown) code=${exitCode} signal=${signalCode ?? "-"}`);
        return;
      }

      const reason = error
        ? `error: ${error.message}`
        : `code=${exitCode} signal=${signalCode ?? "-"} lived=${Math.round(livedMs / 1000)}s`;

      if (!spec.restart) {
        log(spec.name, `exited (no-restart) ${reason}`);
        running.delete(spec.name);
        return;
      }

      // Reset backoff if the process was stable for a while.
      let nextBackoff = livedMs >= STABLE_MS ? MIN_BACKOFF_MS : Math.min(MAX_BACKOFF_MS, backoffMs * 2);
      const nextRestarts = restarts + 1;
      log(spec.name, `CRASHED ${reason} — restart #${nextRestarts} in ${nextBackoff}ms`);

      setTimeout(() => {
        if (shuttingDown) return;
        startService(spec, nextRestarts, nextBackoff);
      }, nextBackoff);
    },
  });

  running.set(spec.name, {
    spec,
    proc,
    restarts,
    backoffMs,
    stopping: false,
  });
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log("supervisor", `received ${signal}, stopping children…`);

  const kills: Promise<void>[] = [];
  for (const [name, entry] of running) {
    entry.stopping = true;
    kills.push(
      (async () => {
        try {
          entry.proc.kill("SIGTERM");
          // Give it a moment, then SIGKILL
          await Bun.sleep(4000);
          if (!entry.proc.killed) {
            log(name, "still alive after SIGTERM, sending SIGKILL");
            entry.proc.kill("SIGKILL");
          }
        } catch {
          /* already dead */
        }
      })(),
    );
  }
  await Promise.all(kills);
  log("supervisor", "all children stopped");
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

const services = buildServices();
if (services.length === 0) {
  console.error("[supervise] no services selected");
  process.exit(1);
}

log(
  "supervisor",
  `root=${ROOT} services=${services.map((s) => s.name).join(",")} ` +
    `(docker postgres must be up: docker compose up -d)`,
);

for (const spec of services) {
  startService(spec);
}

// Keep the supervisor event loop alive.
setInterval(() => {
  // Heartbeat every 5 minutes so logs show the supervisor is still here.
}, 5 * 60_000);

// Immediate first heartbeat line
log("supervisor", "watching — Ctrl+C to stop");
