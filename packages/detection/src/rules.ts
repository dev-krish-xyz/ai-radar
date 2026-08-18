import type { LineDiff, JsonDiff } from "@ai-radar/crawler";
import type { DetectionContext, RawSignal } from "./types";
import { DEFAULT_IMPORTANCE_BY_EVENT_TYPE } from "./importance";
import { SIGNAL_CONFIDENCE_WEIGHTS, type SignalType, type EventType } from "@ai-radar/shared";
import { resolvePublicSourceUrl } from "./publicUrl";
import { MIN_RISING_STARS } from "./quality";
import {
  MODEL_ID_PATTERN,
  HF_REPO_PATTERN,
  ENDPOINT_PATTERN,
  DEPRECATION_PATTERN,
  PRICING_LINE_PATTERN,
  PRICING_AMOUNT_PATTERN,
  CONTEXT_WINDOW_PATTERN,
  AVAILABILITY_PATTERN,
  ANNOUNCEMENT_PATTERN,
  LEAK_PATTERN,
  VERSION_PATTERN,
  CODENAME_PATTERN,
  PROVIDER_NAME_PATTERN,
  LAUNCH_VERB_PATTERN,
} from "./patterns";

export interface RuleInput {
  context: DetectionContext;
  oldContent: string;
  newContent: string;
  lineDiff: LineDiff;
  /** present only when the source serves JSON, e.g. npm/PyPI registries */
  jsonDiff?: JsonDiff;
}

function makeSignal(
  ctx: DetectionContext,
  signalType: SignalType,
  suggestedEventType: EventType,
  entity: string | null,
  title: string,
  description: string,
  evidenceExtra: Record<string, unknown>,
  detectedAt: Date,
  confidenceOverride?: number,
): RawSignal {
  const extra = { ...evidenceExtra };
  const publicUrl = resolvePublicSourceUrl({
    crawlUrl: ctx.sourceUrl,
    sourceType: ctx.sourceType,
    sourceName: ctx.sourceName,
    itemUrl: typeof extra.itemUrl === "string" ? extra.itemUrl : typeof extra.url === "string" ? extra.url : null,
    modelId: typeof extra.modelId === "string" ? extra.modelId : null,
    hfRepo: typeof extra.hfRepo === "string" ? extra.hfRepo : null,
    repo: typeof extra.repo === "string" ? extra.repo : null,
    paperId: typeof extra.paperId === "string" ? extra.paperId : null,
    entity,
  });
  return {
    signalType,
    suggestedEventType,
    entity,
    title,
    description,
    evidence: {
      crawlUrl: ctx.sourceUrl,
      sourceName: ctx.sourceName,
      sourceType: ctx.sourceType,
      ...extra,
      sourceUrl: publicUrl,
    },
    confidenceContribution: confidenceOverride ?? SIGNAL_CONFIDENCE_WEIGHTS[signalType],
    importanceHint: DEFAULT_IMPORTANCE_BY_EVENT_TYPE[suggestedEventType],
    sourceId: ctx.sourceId,
    providerId: ctx.providerId,
    sourceType: ctx.sourceType,
    sourceUrl: publicUrl,
    detectedAt,
  };
}

function uniqueMatches(pattern: RegExp, text: string): string[] {
  const matches = new Set<string>();
  for (const m of text.matchAll(pattern)) matches.add(m[0]);
  return [...matches];
}

/** Runs every deterministic rule against a diff and returns whatever fired. */
export function detectSignals(input: RuleInput, now: Date = new Date()): RawSignal[] {
  const { context: ctx, oldContent, newContent, lineDiff, jsonDiff } = input;
  const signals: RawSignal[] = [];
  const addedText = lineDiff.added.join("\n");
  const removedText = lineDiff.removed.join("\n");
  const isHf =
    ctx.sourceUrl.includes("huggingface.co") || /hugging\s*face/i.test(ctx.sourceName);
  const isFeed =
    ctx.sourceType === "social" ||
    /\.(xml|atom)$/i.test(ctx.sourceUrl) ||
    /\/(feed|rss)/i.test(ctx.sourceUrl) ||
    newContent.startsWith("FEED_ITEMS:");

  if (jsonDiff) {
    signals.push(...detectSdkVersionSignals(ctx, jsonDiff, now));
    if (isHf || ctx.sourceType === "model_catalog") {
      signals.push(...detectCatalogModelSignals(ctx, jsonDiff, now));
    }
    if (ctx.sourceType === "github_repo") {
      signals.push(...detectGithubCommitSignals(ctx, lineDiff, oldContent, now));
    }
    if (newContent.includes('"repos"') && newContent.includes('"details"')) {
      signals.push(...detectDiscoveredRepoSignals(ctx, oldContent, newContent, now));
    }
    if (newContent.includes('"papers"') && newContent.includes('"details"')) {
      signals.push(...detectDailyPaperSignals(ctx, oldContent, newContent, now));
    }
    if (newContent.includes('"stories"') && newContent.includes('"details"')) {
      signals.push(...detectHnStorySignals(ctx, oldContent, newContent, now));
    }
  }

  if (ctx.sourceType === "github_releases") {
    signals.push(...detectGithubReleaseSignals(ctx, lineDiff, oldContent, jsonDiff, now));
  }

  if (ctx.sourceType === "github_repo" && !jsonDiff) {
    signals.push(...detectGithubCommitSignals(ctx, lineDiff, oldContent, now));
  }

  if (["docs", "changelog", "model_catalog", "api_reference"].includes(ctx.sourceType)) {
    // Structured catalog set-diff already fired; skip regex fan-out on the same JSON.
    const catalogHandled = Boolean(jsonDiff && (isHf || ctx.sourceType === "model_catalog"));
    if (!catalogHandled) {
      signals.push(...detectModelIdSignals(ctx, addedText, oldContent, now));
    }
    signals.push(...detectEndpointSignals(ctx, addedText, oldContent, now));
    signals.push(...detectContextWindowSignals(ctx, lineDiff.added, now));
    signals.push(...detectAvailabilitySignals(ctx, lineDiff.added, now));
  }

  if (ctx.sourceType === "pricing") {
    signals.push(...detectPricingSignals(ctx, lineDiff, now));
  }

  if (["blog", "product_page"].includes(ctx.sourceType)) {
    signals.push(...detectAnnouncementSignals(ctx, lineDiff.added, now));
    signals.push(...detectModelIdSignals(ctx, addedText, oldContent, now));
    if (isHf && !jsonDiff) {
      signals.push(...detectHfRepoLineSignals(ctx, lineDiff, oldContent, now));
    }
  }

  // RSS / social: only fire on model IDs, leak language, or provider+launch verb.
  if (isFeed || ctx.sourceType === "social") {
    signals.push(...detectFeedHeadlineSignals(ctx, lineDiff, oldContent, newContent, now));
  }

  // Deprecation language matters everywhere providers write prose.
  signals.push(...detectDeprecationSignals(ctx, lineDiff.added, removedText, now));

  return signals;
}

/**
 * New model IDs from normalized catalog payload `{ latest, count, models[] }`
 * (HF API, HTML catalog extract, or OpenAPI). Set-diff only — index reshuffles
 * of `recent` do not re-fire older ids.
 */
function detectCatalogModelSignals(ctx: DetectionContext, jsonDiff: JsonDiff, now: Date): RawSignal[] {
  // Prefer reading the full new/old sets from the leaf that changed when available.
  // Fall back to path-based latest change only.
  const latestChange = jsonDiff.changed.find((e) => e.path === "$.latest");

  // Collect model ids from any models[] added paths that are truly new members —
  // but only if they don't appear as `from` values elsewhere (reorder artifact).
  const addedModelLeaves = jsonDiff.added
    .filter((e) => /^\$\.(models|recent)\[\d+\]$/.test(e.path) && typeof e.to === "string")
    .map((e) => String(e.to));
  const removedModelLeaves = new Set(
    jsonDiff.removed
      .filter((e) => /^\$\.(models|recent)\[\d+\]$/.test(e.path) && typeof e.from === "string")
      .map((e) => String(e.from)),
  );
  // Also count changed leaves that gained a new string value (recent[0] swap).
  const changedTo = jsonDiff.changed
    .filter((e) => /^\$\.(models|recent)\[\d+\]$/.test(e.path) && typeof e.to === "string")
    .map((e) => String(e.to));
  const changedFrom = new Set(
    jsonDiff.changed
      .filter((e) => /^\$\.(models|recent)\[\d+\]$/.test(e.path) && typeof e.from === "string")
      .map((e) => String(e.from)),
  );

  const candidates = new Set<string>();
  for (const id of [...addedModelLeaves, ...changedTo]) {
    // Skip ids that merely moved index (present in removed/changed-from).
    if (removedModelLeaves.has(id) || changedFrom.has(id)) continue;
    candidates.add(id);
  }
  // Do not treat `$.latest` pointer moves as a new model — latest is an
  // unstable "first seen" field. Only membership changes in models[] count.
  void latestChange;

  if (candidates.size === 0) return [];

  // Cap fan-out — a bulk import shouldn't spam 40 events.
  const isHfCatalog =
    ctx.sourceUrl.includes("huggingface.co") || /hugging\s*face/i.test(ctx.sourceName);
  const isOpenRouter = /openrouter/i.test(`${ctx.sourceUrl} ${ctx.sourceName}`);
  const JUNK_MODEL =
    /(gguf|q[2-8]_k|q[2-8]_0|imatrix|-lora\b|-qlora|-awq|-gptq|-exl2|eval-|test-|dummy-|sample-|tokenizer)/i;
  const OPENROUTER_KEEP = /^(openai|anthropic|google|x-ai|meta-llama|deepseek|mistralai|qwen)\//i;
  return [...candidates]
    .filter((id) => !JUNK_MODEL.test(id))
    .filter((id) => !isOpenRouter || (OPENROUTER_KEEP.test(id) && !/:(free|nitro|extended)/i.test(id)))
    .slice(0, 5)
    .map((id) =>
      makeSignal(
        ctx,
        "new_model_id",
        /preview|instruct-preview/i.test(id) ? "MODEL_PREVIEW" : "MODEL_LAUNCH",
        id,
        isHfCatalog ? `New Hugging Face model: ${id}` : `New model ID in catalog: ${id}`,
        `"${id}" appeared in ${ctx.sourceName} and was not in the previous catalog snapshot.`,
        { modelId: id, hfRepo: isHfCatalog ? id : undefined, latestChanged: latestChange?.to === id, role: "lead" },
        now,
      ),
    );
}

/** HTML/fallback HF pages: catch newly added org/model lines. */
function detectHfRepoLineSignals(
  ctx: DetectionContext,
  lineDiff: LineDiff,
  oldContent: string,
  now: Date,
): RawSignal[] {
  const candidates = new Set<string>();
  for (const line of lineDiff.added) {
    HF_REPO_PATTERN.lastIndex = 0;
    for (const m of line.matchAll(HF_REPO_PATTERN)) {
      const id = m[1]!;
      // Skip obvious non-model paths
      if (/\/(blob|tree|commit|discussions|settings)\b/i.test(id)) continue;
      if (!oldContent.includes(id)) candidates.add(id);
    }
  }
  if (candidates.size === 0) return [];
  return [...candidates].slice(0, 5).map((id) =>
    makeSignal(
      ctx,
      "new_model_id",
      "MODEL_LAUNCH",
      id,
      `New Hugging Face repo mentioned: ${id}`,
      `"${id}" appeared on ${ctx.sourceName}.`,
      { hfRepo: id },
      now,
    ),
  );
}

/**
 * Feed headlines: fire only when the TITLE has a model ID, leak language,
 * or (provider name + launch/release verb). Bare "AI" keywords are not enough.
 */
function feedItemLink(newContent: string, title: string): string | null {
  const blocks = newContent.split(/\n---\n/);
  for (const block of blocks) {
    if (!block.includes(`TITLE: ${title}`)) continue;
    const m = block.match(/^LINK:\s*(\S+)/m);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function detectFeedHeadlineSignals(
  ctx: DetectionContext,
  lineDiff: LineDiff,
  oldContent: string,
  newContent: string,
  now: Date,
): RawSignal[] {
  const titleLines = lineDiff.added.filter((l) => l.startsWith("TITLE: "));
  if (titleLines.length === 0) return [];

  const signals: RawSignal[] = [];
  for (const line of titleLines.slice(0, 6)) {
    const title = line.slice("TITLE: ".length).trim();
    if (!title || oldContent.includes(line)) continue;

    MODEL_ID_PATTERN.lastIndex = 0;
    CODENAME_PATTERN.lastIndex = 0;
    const modelMatch = title.match(MODEL_ID_PATTERN);
    const codeMatch = title.match(CODENAME_PATTERN);
    const hasModel = Boolean(modelMatch);
    const hasCodename = Boolean(codeMatch);
    const hasLeak = LEAK_PATTERN.test(title);
    const hasProviderLaunch = PROVIDER_NAME_PATTERN.test(title) && LAUNCH_VERB_PATTERN.test(title);

    if (!hasModel && !hasCodename && !hasLeak && !hasProviderLaunch) continue;

    const entity = modelMatch?.[0] ?? codeMatch?.[0] ?? null;
    const eventType = hasLeak && !hasModel
      ? "OTHER"
      : hasModel
        ? /preview/i.test(entity ?? "")
          ? "MODEL_PREVIEW"
          : "MODEL_LAUNCH"
        : hasCodename
          ? "MODEL_PREVIEW"
          : "NEW_PRODUCT";
    const signalType = hasModel ? "new_model_id" : hasLeak || hasCodename ? "other" : "product_launch";
    const itemUrl = feedItemLink(newContent, title);

    signals.push(
      makeSignal(
        ctx,
        signalType as "new_model_id" | "other" | "product_launch",
        eventType as "OTHER" | "MODEL_PREVIEW" | "MODEL_LAUNCH" | "NEW_PRODUCT",
        entity,
        entity ? `Feed: ${entity} — ${title.slice(0, 120)}` : `Feed: ${title.slice(0, 160)}`,
        `New headline on ${ctx.sourceName}: ${title}`,
        { headline: title.slice(0, 300), leak: hasLeak, role: "context", itemUrl, url: itemUrl },
        now,
      ),
    );
  }
  return signals;
}

function detectGithubCommitSignals(
  ctx: DetectionContext,
  lineDiff: LineDiff,
  oldContent: string,
  now: Date,
): RawSignal[] {
  const addedText = lineDiff.added.join("\n");
  const signals: RawSignal[] = [];

  const models = uniqueMatches(MODEL_ID_PATTERN, addedText).filter(
    (id) => !oldContent.toLowerCase().includes(id.toLowerCase()),
  );
  for (const entity of models.slice(0, 3)) {
    signals.push(
      makeSignal(
        ctx,
        "new_model_id",
        /preview/i.test(entity) ? "MODEL_PREVIEW" : "MODEL_LAUNCH",
        entity,
        `Model ID in ${ctx.sourceName} commits: ${entity}`,
        `"${entity}" appeared in recent commit messages on ${ctx.sourceName}.`,
        { matchedId: entity, role: "lead" },
        now,
      ),
    );
  }

  CODENAME_PATTERN.lastIndex = 0;
  const codes = uniqueMatches(CODENAME_PATTERN, addedText).filter(
    (c) => !oldContent.toLowerCase().includes(c.toLowerCase()),
  );
  for (const code of codes.slice(0, 3)) {
    if (models.some((m) => m.toLowerCase().includes(code.toLowerCase()))) continue;
    signals.push(
      makeSignal(
        ctx,
        "other",
        "MODEL_PREVIEW",
        code,
        `Codename in ${ctx.sourceName} commits: ${code}`,
        `"${code}" appeared in recent commit messages — possible unreleased model.`,
        { codename: code, role: "lead" },
        now,
      ),
    );
  }

  return signals;
}

function detectModelIdSignals(ctx: DetectionContext, addedText: string, oldContent: string, now: Date): RawSignal[] {
  const candidates = uniqueMatches(MODEL_ID_PATTERN, addedText);
  const genuinelyNew = candidates.filter((id) => !oldContent.toLowerCase().includes(id.toLowerCase()));
  if (genuinelyNew.length === 0) return [];

  return genuinelyNew.map((entity) =>
    makeSignal(
      ctx,
      "new_model_id",
      /preview/i.test(entity) ? "MODEL_PREVIEW" : "MODEL_LAUNCH",
      entity,
      `New model ID: ${entity}`,
      `"${entity}" appeared on ${ctx.sourceName} and was not present in the previous snapshot.`,
      { matchedId: entity },
      now,
    ),
  );
}

function detectEndpointSignals(ctx: DetectionContext, addedText: string, oldContent: string, now: Date): RawSignal[] {
  const candidates = uniqueMatches(ENDPOINT_PATTERN, addedText);
  const genuinelyNew = candidates.filter((path) => !oldContent.includes(path));
  if (genuinelyNew.length === 0) return [];

  return genuinelyNew.map((path) =>
    makeSignal(
      ctx,
      "new_endpoint",
      "NEW_ENDPOINT",
      null,
      `New API path: ${path}`,
      `"${path}" appeared on ${ctx.sourceName} and was not present in the previous snapshot.`,
      { matchedPath: path },
      now,
    ),
  );
}

function detectContextWindowSignals(ctx: DetectionContext, addedLines: string[], now: Date): RawSignal[] {
  const line = addedLines.find((l) => CONTEXT_WINDOW_PATTERN.test(l));
  if (!line) return [];
  return [
    makeSignal(
      ctx,
      "capability_change",
      "CONTEXT_WINDOW_CHANGE",
      null,
      "Context window change detected",
      line.slice(0, 300),
      { matchedLine: line.slice(0, 300) },
      now,
    ),
  ];
}

function detectAvailabilitySignals(ctx: DetectionContext, addedLines: string[], now: Date): RawSignal[] {
  const line = addedLines.find((l) => AVAILABILITY_PATTERN.test(l));
  if (!line) return [];
  return [
    makeSignal(
      ctx,
      "availability_change",
      "AVAILABILITY_CHANGE",
      null,
      "Availability change detected",
      line.slice(0, 300),
      { matchedLine: line.slice(0, 300) },
      now,
    ),
  ];
}

function detectDeprecationSignals(ctx: DetectionContext, addedLines: string[], removedText: string, now: Date): RawSignal[] {
  const line = addedLines.find((l) => DEPRECATION_PATTERN.test(l));
  if (!line) return [];
  return [
    makeSignal(
      ctx,
      "deprecation",
      "DEPRECATION",
      null,
      "Deprecation / migration notice detected",
      line.slice(0, 300),
      { matchedLine: line.slice(0, 300) },
      now,
    ),
  ];
}

function detectPricingSignals(ctx: DetectionContext, lineDiff: LineDiff, now: Date): RawSignal[] {
  const addedPriceLines = lineDiff.added.filter(
    (l) => PRICING_LINE_PATTERN.test(l) || PRICING_AMOUNT_PATTERN.test(l),
  );
  const removedPriceLines = lineDiff.removed.filter(
    (l) => PRICING_LINE_PATTERN.test(l) || PRICING_AMOUNT_PATTERN.test(l),
  );
  if (addedPriceLines.length === 0 && removedPriceLines.length === 0) return [];

  return [
    makeSignal(
      ctx,
      "pricing_change",
      "PRICING_CHANGE",
      null,
      "Pricing page changed",
      `${addedPriceLines.length} price line(s) added, ${removedPriceLines.length} removed on ${ctx.sourceName}.`,
      { added: addedPriceLines.slice(0, 10), removed: removedPriceLines.slice(0, 10) },
      now,
    ),
  ];
}

function detectAnnouncementSignals(ctx: DetectionContext, addedLines: string[], now: Date): RawSignal[] {
  const line = addedLines.find((l) => {
    ANNOUNCEMENT_PATTERN.lastIndex = 0;
    MODEL_ID_PATTERN.lastIndex = 0;
    return ANNOUNCEMENT_PATTERN.test(l) && MODEL_ID_PATTERN.test(l);
  });
  if (!line) return [];
  MODEL_ID_PATTERN.lastIndex = 0;
  const entityMatch = line.match(MODEL_ID_PATTERN);
  const entity = entityMatch ? entityMatch[0] : null;
  return [
    makeSignal(
      ctx,
      "product_launch",
      "NEW_PRODUCT",
      entity,
      entity ? `Announcement mentions ${entity}` : "Announcement-style copy detected",
      line.slice(0, 300),
      { matchedLine: line.slice(0, 300) },
      now,
    ),
  ];
}

function detectGithubReleaseSignals(
  ctx: DetectionContext,
  lineDiff: LineDiff,
  oldContent: string,
  jsonDiff: JsonDiff | undefined,
  now: Date,
): RawSignal[] {
  // Preferred path: normalized tags payload `{ latest, tags: [...] }` from API/Atom.
  if (jsonDiff) {
    const latestChange = jsonDiff.changed.find((e) => e.path === "$.latest");
    if (latestChange && latestChange.to != null && String(latestChange.to).length > 0) {
      const tag = String(latestChange.to);
      return [
        makeSignal(
          ctx,
          "github_release",
          "GITHUB_CHANGE",
          tag,
          `New GitHub tag/release on ${ctx.sourceName}: ${tag}`,
          `Latest tag moved to ${tag} (was ${latestChange.from ?? "unknown"}).`,
          { previousLatest: latestChange.from ?? null, latest: tag },
          now,
        ),
      ];
    }

    // New tags appearing in the list without a clean latest change (e.g. first snapshot shape drift).
    const newTagEntries = jsonDiff.added.filter(
      (e) => /^\$\.tags\[\d+\]$/.test(e.path) && typeof e.to === "string",
    );
    if (newTagEntries.length > 0) {
      const tag = String(newTagEntries[0]!.to);
      return [
        makeSignal(
          ctx,
          "github_release",
          "GITHUB_CHANGE",
          tag,
          `New GitHub tag on ${ctx.sourceName}: ${tag}`,
          `${newTagEntries.length} new tag(s) appeared; newest added: ${tag}.`,
          { newTags: newTagEntries.map((e) => e.to).slice(0, 10) },
          now,
        ),
      ];
    }
  }

  // HTML fallback: look for version-like lines that weren't in the prior snapshot.
  // Require a v-prefix OR a full semver on its own short line to cut CSS/asset noise.
  const candidates = lineDiff.added.filter((l) => {
    const trimmed = l.trim();
    if (trimmed.length > 80) return false;
    if (!VERSION_PATTERN.test(trimmed)) return false;
    VERSION_PATTERN.lastIndex = 0;
    if (oldContent.includes(trimmed)) return false;
    return /^v?\d+\.\d+\.\d+([\w.-]*)?$/i.test(trimmed) || /\brelease[sd]?\b/i.test(trimmed);
  });
  if (candidates.length === 0) return [];
  const line = candidates[0]!;
  const versionMatch = line.match(VERSION_PATTERN);
  return [
    makeSignal(
      ctx,
      "github_release",
      "GITHUB_CHANGE",
      versionMatch ? versionMatch[0] : null,
      `New GitHub release on ${ctx.sourceName}`,
      line.slice(0, 300),
      { matchedLine: line.slice(0, 300) },
      now,
    ),
  ];
}

function detectSdkVersionSignals(ctx: DetectionContext, jsonDiff: JsonDiff, now: Date): RawSignal[] {
  const versionPathPattern = /^\$\.(versions|releases)\.([^.[\]]+)$/;
  const newVersions = jsonDiff.added
    .map((entry) => entry.path.match(versionPathPattern))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => m[2]!);

  if (newVersions.length === 0) return [];

  return newVersions.map((version) =>
    makeSignal(
      ctx,
      "sdk_change",
      "SDK_CHANGE",
      version,
      `New SDK release: ${version}`,
      `${ctx.sourceName} published version ${version}.`,
      { version },
      now,
    ),
  );
}

const DISCOVERY_ALERT_CAP = 3;
const DISCOVERY_CONFIDENCE = 40;

function parseStringList(content: string, key: "repos" | "papers" | "stories"): string[] {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const arr = parsed[key];
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function parseDetails(content: string): Record<string, Record<string, unknown>> {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const d = parsed.details;
    if (!d || typeof d !== "object") return {};
    return d as Record<string, Record<string, unknown>>;
  } catch {
    return {};
  }
}

function detectDiscoveredRepoSignals(
  ctx: DetectionContext,
  oldContent: string,
  newContent: string,
  now: Date,
): RawSignal[] {
  const oldSet = new Set(parseStringList(oldContent, "repos"));
  const fresh = parseStringList(newContent, "repos").filter((id) => !oldSet.has(id));
  if (fresh.length === 0) return [];

  const details = parseDetails(newContent);
  return fresh
    .filter((fullName) => {
      const stars = details[fullName]?.stars;
      // Search API rows have a real count; trending HTML leaves stars at 0.
      if (typeof stars !== "number") return true;
      if (stars >= MIN_RISING_STARS) return true;
      return stars === 0 && /trending/i.test(`${ctx.sourceUrl} ${ctx.sourceName}`);
    })
    .slice(0, DISCOVERY_ALERT_CAP)
    .map((fullName) => {
    const meta = details[fullName] ?? {};
    const stars = typeof meta.stars === "number" ? meta.stars : null;
    const desc = typeof meta.description === "string" ? meta.description : "";
    const url = typeof meta.url === "string" ? meta.url : `https://github.com/${fullName}`;
    return makeSignal(
      ctx,
      "product_launch",
      "NEW_PRODUCT",
      fullName,
      `Rising AI repo: ${fullName}${stars != null ? ` (${stars}★)` : ""}`,
      [desc, url].filter(Boolean).join(" — ").slice(0, 400) || `${fullName} appeared on ${ctx.sourceName}.`,
      { repo: fullName, stars, url, role: "lead", postable: true },
      now,
      DISCOVERY_CONFIDENCE,
    );
  });
}

function detectDailyPaperSignals(
  ctx: DetectionContext,
  oldContent: string,
  newContent: string,
  now: Date,
): RawSignal[] {
  const oldSet = new Set(parseStringList(oldContent, "papers"));
  const fresh = parseStringList(newContent, "papers").filter((id) => !oldSet.has(id));
  if (fresh.length === 0) return [];

  const HIGH_PAPER =
    /\b(sota|state[- ]of[- ]the[- ]art|beats|outperform|foundation model|reasoning|agentic|computer[- ]use|open[- ]weights?|new model|multimodal|benchmark)\b/i;
  const details = parseDetails(newContent);
  return fresh
    .filter((id) => {
      const title = String(details[id]?.title ?? id);
      return HIGH_PAPER.test(title);
    })
    .slice(0, DISCOVERY_ALERT_CAP)
    .map((id) => {
    const meta = details[id] ?? {};
    const title = typeof meta.title === "string" ? meta.title : id;
    const url = typeof meta.url === "string" ? meta.url : `https://huggingface.co/papers/${id}`;
    return makeSignal(
      ctx,
      "product_launch",
      "NEW_PRODUCT",
      id,
      `HF Daily Paper: ${title.slice(0, 140)}`,
      url,
      { paperId: id, url, role: "lead", postable: true },
      now,
      DISCOVERY_CONFIDENCE,
    );
  });
}

function detectHnStorySignals(
  ctx: DetectionContext,
  oldContent: string,
  newContent: string,
  now: Date,
): RawSignal[] {
  const oldSet = new Set(parseStringList(oldContent, "stories"));
  const fresh = parseStringList(newContent, "stories").filter((id) => !oldSet.has(id));
  if (fresh.length === 0) return [];

  const details = parseDetails(newContent);
  return fresh.slice(0, DISCOVERY_ALERT_CAP).map((id) => {
    const meta = details[id] ?? {};
    const title = typeof meta.title === "string" ? meta.title : id;
    const url = typeof meta.url === "string" ? meta.url : `https://news.ycombinator.com/item?id=${id}`;
    const points = typeof meta.points === "number" ? meta.points : 0;
    return makeSignal(
      ctx,
      "product_launch",
      "NEW_PRODUCT",
      null,
      `HN: ${title.slice(0, 140)}`,
      `${title} (${points} points)`,
      { hnId: id, url, itemUrl: url, points, role: "lead", postable: true },
      now,
      DISCOVERY_CONFIDENCE,
    );
  });
}

/** A single-line diff this long is prose (a post title, a caption), not a counter/version bump. */
const SUBSTANTIAL_SINGLE_LINE_CHARS = 40;

const PROSE_SOURCE_TYPES = new Set(["blog", "changelog", "docs", "social", "product_page", "pricing"]);

export interface SemanticReviewOpts {
  sourceType?: string;
  newContent?: string;
}

/** True when a prose diff is worth an LLM check. Never burn Groq on registries or set-diff JSON. */
export function needsSemanticReview(
  lineDiff: LineDiff,
  alreadyFiredRuleSignals: number,
  opts: SemanticReviewOpts = {},
): boolean {
  if (alreadyFiredRuleSignals > 0) return false;
  if (opts.sourceType === "sdk_npm" || opts.sourceType === "sdk_pypi") return false;
  if (opts.sourceType === "github_releases") return false;
  const content = opts.newContent ?? "";
  if (content.includes('"repos"') && content.includes('"details"')) return false;
  if (content.includes('"papers"') && content.includes('"details"')) return false;
  if (content.includes('"stories"') && content.includes('"details"')) return false;
  if (content.includes('"models"') && content.includes('"count"')) return false;
  if (content.startsWith("FEED_ITEMS:")) return false;
  if (opts.sourceType && !PROSE_SOURCE_TYPES.has(opts.sourceType)) return false;
  if (lineDiff.added.length >= 2 || lineDiff.removed.length >= 2) return true;
  return [...lineDiff.added, ...lineDiff.removed].some((l) => l.length >= SUBSTANTIAL_SINGLE_LINE_CHARS);
}
