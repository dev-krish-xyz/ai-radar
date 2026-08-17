# AI Release Radar

Personal content-research tool. Watches official sources (blogs, docs, changelogs,
model catalogs, pricing pages, GitHub releases, SDK registries) for Tier 1 AI
providers (OpenAI, Anthropic, Google Gemini, xAI) and Tier 2 providers (Meta/Llama,
DeepSeek, Mistral, Qwen — disabled by default), and tries to surface meaningful
product/model changes before the provider's own social accounts announce them.

Not a SaaS product. No auth, no multi-tenancy, no billing. Single Postgres database,
one worker process, one small dashboard.

## Architecture

```
apps/
  web/      Next.js dashboard (Events, Live Signals, Providers, Event Detail)
  api/      Hono API serving the dashboard from Postgres
  worker/   crawl loop + detection pipeline + Telegram alerts
packages/
  db/          Drizzle schema + client (providers, sources, snapshots, signals, events, event_signals)
  shared/      cross-cutting types, env loader, Telegram sender, Groq LLM classifier
  providers/   the provider/source registry (this is what you edit to add sources)
  crawler/     HTTP fetch (ETag/retry/rate-limit), HTML/JSON extraction, hashing, diffing
  detection/   rule-based signal detectors, confidence/importance scoring, correlation, alert formatting
```

### Pipeline

`apps/worker/src/scheduler.ts` runs a tick every 60s. Each tick:

1. **SOURCE → FETCH** (`packages/crawler/fetcher.ts`) — conditional GET with
   ETag/Last-Modified, retries with backoff, per-host rate limiting (1.5s min gap).
2. **SNAPSHOT** (`apps/worker/pipeline.ts`) — extracts meaningful content
   (`crawler/extract.ts`: strips script/style/nav/footer for HTML, sorts keys for
   JSON), hashes it, stores a snapshot row only when the hash changed.
3. **DIFF** (`crawler/diff.ts`) — multiset line diff for text, structural path diff
   for JSON (used for npm/PyPI registry version detection).
4. **SIGNAL DETECTION** (`detection/rules.ts`) — deterministic regex rules per
   source type: new model IDs, new endpoints, deprecation language, pricing lines,
   context-window mentions, availability language, SDK version bumps, GitHub
   releases, announcement copy. Cheap and runs on every diff.
5. **LLM fallback** (`detection/rules.ts: needsSemanticReview` +
   `shared/llm.ts: classifyDiffSignificance`) — only called when a diff has
   substance (2+ added/removed lines, or any single line ≥40 chars — extraction
   can flatten a page into one dense line, so a single-line character-length
   check catches real prose changes a line-count-only gate would miss) *and* no
   deterministic rule already fired. Calls Groq (`llama-3.3-70b-versatile`) with
   a tool-forced JSON schema; output is validated before it can become a signal,
   so free-form LLM text can never trigger anything directly.
6. **CORRELATION** (`apps/worker/correlate.ts` + `detection/correlation.ts`) —
   every uncorrelated signal is matched against open `PRE_ANNOUNCEMENT` events for
   the same provider (by entity match, else title/description token-overlap ≥
   0.2), within a 6h rolling window (hard cap 72h from first detection). No match
   → seeds a new event.
7. **CONFIDENCE / IMPORTANCE** (`detection/confidence.ts`) — confidence sums the
   strongest contribution per *distinct* signal type (duplicates of the same type
   don't stack) plus a corroboration bonus for 2-3+ independent source types,
   capped at 100. Importance is the max default-by-event-type across contributing
   signals, +1 for 3+ signals.
8. **ALERT** — fires once per event when `meetsAlertThreshold` passes
   (`shared/types.ts`): (conf≥60 & imp≥6) OR early high-importance
   (imp≥8 & conf≥35) OR solid mid-tier (imp≥6 & conf≥40) OR official-channel
   (blog/CONFIRMED, imp≥6 & conf≥15). Sent via Telegram
   (`detection/alertFormat.ts` → `shared/telegram.ts`). `alertedAt` is only set
   after a successful send — failures retry on later ticks.

### Confirmation

A signal from an official announcement channel (`blog` or `product_page` source
type) that matches an existing `PRE_ANNOUNCEMENT` event flips it to `CONFIRMED`,
records `officiallyAnnouncedAt`, and computes `leadTimeMinutes` (first detection →
announcement). If the very first signal for an event already comes from an
announcement channel, the event is created as `CONFIRMED` with lead time 0 — there
was no pre-announcement to speak of.

## Commands

```bash
bun install                 # install all workspace deps
docker compose up -d        # start Postgres (localhost:5433)
cp .env.example .env         # fill in DATABASE_URL / TELEGRAM_* / GROQ_API_KEY

bun run db:generate         # generate a drizzle migration after schema.ts changes
bun run db:migrate          # apply migrations
bun run db:seed             # sync packages/providers registry into the DB (idempotent)

bun run worker              # crawl loop, ticks every 60s, runs forever
bun run worker:once         # single pass then exit (useful for testing)
bun run api                 # Hono API on :8787
bun run web                 # Next.js dashboard (apps/web), talks to API_URL (default :8787)

bun run typecheck           # tsc -b across every package/app except apps/web (Next manages its own)
```

Preferred: run the supervisor (auto-restarts worker + api on crash):

```bash
docker compose up -d
bun run db:seed
bun run up              # worker + api, restarts on crash
# or
bun run up:web          # + Next.js dashboard
# macOS login auto-start:
bun run install:launchd
```

You can still run `worker`, `api`, and `web` as three separate processes.

## Early / leak-oriented sources

`packages/providers/src/early.ts` is **lead-only**: HF blog, Simon Willison, HF
org APIs, **rising GitHub repos** (Search API, 7-day / ≥30★), **GitHub Trending
AI-filtered**, and **HF Daily Papers**. Press RSS (Verge/TC) is `enabled: false`.
First snapshot of discovery sources is a baseline (no 40-item dump). New repo /
paper names after that Telegram as postable content. Set `GITHUB_TOKEN` for
reliable repo search.

## Adding or changing sources

Edit `packages/providers/src/tier1/*.ts` (or `tier2/*.ts`), then run
`bun run db:seed` — it upserts by `(providerId, url)`, so re-running is safe.
Each `SourceConfig` needs a `type` (drives both detection rules and default crawl
cadence — see `CRAWL_INTERVALS` in `packages/providers/src/types.ts`: registries
catalogs/changelogs/blogs ~5min, docs/product ~10min, GitHub/SDKs ~10min,
pricing ~30min). GitHub sources fetch `tags.atom` (or Tags API when
`GITHUB_TOKEN` is set) rather than scraping HTML release pages.

Tier 2 providers are seeded but `enabled: false` on both the provider and
implicitly its sources — flip `enabled: true` in the provider config once Tier 1
has run reliably for a while (per the original spec).

## Known source quirks

- `openai.com` (root domain) and `x.ai` (root domain) sit behind a Cloudflare
  interactive challenge and reject plain HTTP fetches — we use `developers.openai.com`
  and `docs.x.ai` instead, which don't.
- `ai.google.dev` docs pages redirect anonymous (non-cookied) requests through a
  silent-signin flow that never resolves for a plain fetch — we use the Vertex AI
  mirror of the Gemini release notes instead.
- If a source starts erroring, check `GET /providers` (or the Providers dashboard
  page) for `lastStatus` before assuming the detection logic is broken.

## Notes for future changes

- `signals.suggestedEventType` and `signals.sourceType` are intentionally
  denormalized onto the signals table (not just derivable via join) — correlation
  and confidence scoring read them on every tick and need them cheap.
- Confidence/importance recompute from *all* signals on an event every time a new
  one attaches, not incrementally — event sizes are small (a handful of signals),
  so this is simpler than tracking deltas and not worth optimizing.
- The LLM classifier (`shared/llm.ts`) always forces a tool call with a fixed JSON
  schema and validates every field before use — never wire a free-text LLM
  response directly into signal/event creation.
