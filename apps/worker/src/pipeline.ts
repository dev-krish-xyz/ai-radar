import { db, sources as sourcesTable, snapshots as snapshotsTable, signals as signalsTable } from "@ai-radar/db";
import type { providers as providersTable } from "@ai-radar/db";
import { desc, eq } from "drizzle-orm";
import {
  fetchSource,
  extractContent,
  extractGithubReleaseContent,
  extractGithubRepoContent,
  extractHfContent,
  extractModelCatalog,
  isHuggingFaceSource,
  resolveHfFetchUrl,
  hashContent,
  diffLines,
  diffJson,
  isJsonContentType,
  isGithubSourceType,
  resolveGithubFetchUrl,
  isFeedContent,
  extractFeedContent,
  buildRisingReposSearchUrl,
  isGithubSearchUrl,
  isGithubTrendingUrl,
  extractGithubSearchRepos,
  extractGithubTrendingRepos,
  githubSearchAuthHeaders,
  isHfDailyPapersUrl,
  extractHfDailyPapers,
} from "@ai-radar/crawler";
import {
  detectSignals,
  needsSemanticReview,
  signalFromLlmClassification,
  type DetectionContext,
} from "@ai-radar/detection";
import { classifyDiffSignificance, SIGNAL_CONFIDENCE_WEIGHTS } from "@ai-radar/shared";

type SourceRow = typeof sourcesTable.$inferSelect;
type ProviderRow = typeof providersTable.$inferSelect;

const MAX_LLM_DIFF_CHARS = 4000;

/** Below this, treat extraction as a fetch glitch (empty JS-shell response) rather than real content. */
const MIN_CONTENT_CHARS = 20;

export interface ProcessResult {
  sourceId: number;
  status: "unchanged" | "changed" | "not_modified" | "first_snapshot" | "error";
  signalsCreated: number;
  error?: string;
  fetchUrl?: string;
}

function resolveFetchUrl(source: SourceRow): string {
  if (isGithubSearchUrl(source.url) || /rising ai repos/i.test(source.name)) {
    return buildRisingReposSearchUrl();
  }
  if (isGithubSourceType(source.type)) return resolveGithubFetchUrl(source.url, source.type);
  if (isHfDailyPapersUrl(source.url)) return source.url;
  if (isHuggingFaceSource(source.url, source.name)) return resolveHfFetchUrl(source.url);
  return source.url;
}

function looksStructuredCatalog(content: string): boolean {
  const t = content.trimStart();
  return (
    (t.startsWith("{") &&
      (t.includes('"latest"') || t.includes('"models"') || t.includes('"repos"') || t.includes('"papers"'))) ||
    t.startsWith("FEED_ITEMS:")
  );
}

export async function processSource(source: SourceRow, provider: ProviderRow): Promise<ProcessResult> {
  const fetchUrl = resolveFetchUrl(source);

  const fetchResult = await fetchSource(fetchUrl, {
    etag: source.etag,
    lastModified: source.lastModified,
    headers: isGithubSearchUrl(fetchUrl) ? githubSearchAuthHeaders() : undefined,
  });

  const now = new Date();

  if (!fetchResult.ok) {
    const statusMsg = `error: ${fetchResult.error}${fetchUrl !== source.url ? ` via ${fetchUrl}` : ""}`;
    await db
      .update(sourcesTable)
      .set({ lastCrawledAt: now, lastStatus: statusMsg.slice(0, 500) })
      .where(eq(sourcesTable.id, source.id));
    console.error(`[pipeline] FETCH FAIL ${provider.name}/${source.name}: ${statusMsg}`);
    return {
      sourceId: source.id,
      status: "error",
      signalsCreated: 0,
      error: fetchResult.error ?? "unknown",
      fetchUrl,
    };
  }

  if (fetchResult.notModified) {
    await db
      .update(sourcesTable)
      .set({ lastCrawledAt: now, lastStatus: "ok (304)" })
      .where(eq(sourcesTable.id, source.id));
    return { sourceId: source.id, status: "not_modified", signalsCreated: 0, fetchUrl };
  }

  const body = fetchResult.body ?? "";
  let extracted: string;
  let contentIsJson = isJsonContentType(fetchResult.contentType);

  if (isGithubSearchUrl(fetchUrl) || /rising ai repos/i.test(source.name)) {
    const found = extractGithubSearchRepos(body);
    if (found) {
      extracted = found;
      contentIsJson = true;
    } else {
      extracted = extractContent(body, fetchResult.contentType, fetchUrl);
    }
  } else if (isGithubTrendingUrl(fetchUrl) || /github trending/i.test(source.name)) {
    const found = extractGithubTrendingRepos(body);
    if (found) {
      extracted = found;
      contentIsJson = true;
    } else {
      extracted = extractContent(body, fetchResult.contentType, fetchUrl);
    }
  } else if (isHfDailyPapersUrl(fetchUrl)) {
    const papers = extractHfDailyPapers(body);
    if (papers) {
      extracted = papers;
      contentIsJson = true;
    } else {
      extracted = extractContent(body, fetchResult.contentType, fetchUrl);
    }
  } else if (source.type === "github_repo") {
    const gh = extractGithubRepoContent(body, fetchResult.contentType, fetchUrl);
    if (gh) {
      extracted = gh;
      contentIsJson = true;
    } else {
      extracted = extractContent(body, fetchResult.contentType, fetchUrl);
      console.warn(
        `[pipeline] GitHub commit extract failed for ${source.name} (${fetchUrl}); fell back (${extracted.length} chars)`,
      );
    }
  } else if (source.type === "github_releases") {
    const gh = extractGithubReleaseContent(body, fetchResult.contentType, fetchUrl);
    if (gh) {
      extracted = gh;
      contentIsJson = true;
    } else {
      extracted = extractContent(body, fetchResult.contentType, fetchUrl);
      console.warn(
        `[pipeline] GitHub structured extract failed for ${source.name} (${fetchUrl}); fell back to HTML/text (${extracted.length} chars)`,
      );
    }
  } else if (isFeedContent(body, fetchResult.contentType, fetchUrl) || source.type === "social") {
    // Feeds first — HF blog lives on huggingface.co but is Atom, not the models API.
    const feed = extractFeedContent(body);
    if (feed) {
      extracted = feed;
      contentIsJson = false;
    } else {
      extracted = extractContent(body, fetchResult.contentType, fetchUrl);
    }
  } else if (
    fetchUrl.includes("huggingface.co/api/models") ||
    (isHuggingFaceSource(source.url, source.name) && !fetchUrl.includes("/blog"))
  ) {
    const hf = extractHfContent(body, fetchResult.contentType, fetchUrl);
    if (hf) {
      extracted = hf;
      contentIsJson = true;
    } else {
      extracted = extractContent(body, fetchResult.contentType, fetchUrl);
      console.warn(
        `[pipeline] HF structured extract failed for ${source.name}; fell back (${extracted.length} chars)`,
      );
    }
  } else if (source.type === "model_catalog") {
    const catalog = extractModelCatalog(body, fetchResult.contentType, fetchUrl);
    if (catalog) {
      extracted = catalog;
      contentIsJson = true;
    } else {
      extracted = extractContent(body, fetchResult.contentType, fetchUrl);
    }
  } else {
    extracted = extractContent(body, fetchResult.contentType, fetchUrl);
  }

  const contentHash = hashContent(extracted);

  if (extracted.length < MIN_CONTENT_CHARS) {
    await db
      .update(sourcesTable)
      .set({ lastCrawledAt: now, lastStatus: `error: empty extraction (${extracted.length} chars)` })
      .where(eq(sourcesTable.id, source.id));
    console.error(
      `[pipeline] EMPTY EXTRACT ${provider.name}/${source.name}: ${extracted.length} chars from ${fetchUrl}`,
    );
    return { sourceId: source.id, status: "error", signalsCreated: 0, error: "empty extraction", fetchUrl };
  }

  await db
    .update(sourcesTable)
    .set({
      lastCrawledAt: now,
      lastStatus: `ok (${fetchResult.status})`,
      etag: fetchResult.etag,
      lastModified: fetchResult.lastModified,
    })
    .where(eq(sourcesTable.id, source.id));

  if (contentHash === source.lastContentHash) {
    return { sourceId: source.id, status: "unchanged", signalsCreated: 0, fetchUrl };
  }

  const previousSnapshot = await db.query.snapshots.findFirst({
    where: eq(snapshotsTable.sourceId, source.id),
    orderBy: [desc(snapshotsTable.fetchedAt)],
  });

  const [newSnapshot] = await db
    .insert(snapshotsTable)
    .values({
      sourceId: source.id,
      contentHash,
      extractedContent: extracted,
      statusCode: fetchResult.status,
      fetchedAt: now,
    })
    .returning();

  await db.update(sourcesTable).set({ lastContentHash: contentHash }).where(eq(sourcesTable.id, source.id));

  if (!previousSnapshot) {
    console.log(`[pipeline] baseline snapshot for ${provider.name}/${source.name}`);
    return { sourceId: source.id, status: "first_snapshot", signalsCreated: 0, fetchUrl };
  }

  // Format migration (HTML → structured API/feed): re-baseline without false signals.
  if (looksStructuredCatalog(extracted) !== looksStructuredCatalog(previousSnapshot.extractedContent)) {
    console.log(
      `[pipeline] format migration for ${provider.name}/${source.name}; re-baselining without signals`,
    );
    return { sourceId: source.id, status: "first_snapshot", signalsCreated: 0, fetchUrl };
  }

  const lineDiff = diffLines(previousSnapshot.extractedContent, extracted);
  if (lineDiff.added.length === 0 && lineDiff.removed.length === 0) {
    return { sourceId: source.id, status: "unchanged", signalsCreated: 0, fetchUrl };
  }

  let jsonDiff;
  if (contentIsJson) {
    try {
      jsonDiff = diffJson(JSON.parse(previousSnapshot.extractedContent), JSON.parse(extracted));
    } catch {
      jsonDiff = undefined;
    }
  }

  const ctx: DetectionContext = {
    providerId: provider.id,
    providerName: provider.name,
    sourceId: source.id,
    sourceName: source.name,
    sourceType: source.type,
    sourceUrl: source.url,
  };

  const ruleSignals = detectSignals({
    context: ctx,
    oldContent: previousSnapshot.extractedContent,
    newContent: extracted,
    lineDiff,
    jsonDiff,
  });

  let allSignals = ruleSignals;

  if (needsSemanticReview(lineDiff, ruleSignals.length)) {
    const diffExcerpt = [
      ...lineDiff.added.slice(0, 40).map((l) => `+ ${l}`),
      ...lineDiff.removed.slice(0, 40).map((l) => `- ${l}`),
    ]
      .join("\n")
      .slice(0, MAX_LLM_DIFF_CHARS);

    const classification = await classifyDiffSignificance({
      providerName: provider.name,
      sourceName: source.name,
      sourceType: source.type,
      sourceUrl: source.url,
      diffExcerpt,
    }).catch((err) => {
      console.error(`[pipeline] LLM classification failed for ${source.url}:`, err);
      return null;
    });

    if (classification) {
      const llmSignal = signalFromLlmClassification(ctx, classification, SIGNAL_CONFIDENCE_WEIGHTS, now);
      if (llmSignal) allSignals = [...allSignals, llmSignal];
    }
  }

  if (allSignals.length === 0) {
    const addedPreview = lineDiff.added.slice(0, 5).map((l) => `+ ${l}`);
    const removedPreview = lineDiff.removed.slice(0, 5).map((l) => `- ${l}`);
    console.log(
      `[diff] ${source.name} (${lineDiff.added.length} added / ${lineDiff.removed.length} removed, no rule/LLM signal):\n` +
        [...addedPreview, ...removedPreview].join("\n"),
    );
    return { sourceId: source.id, status: "changed", signalsCreated: 0, fetchUrl };
  }

  await db.insert(signalsTable).values(
    allSignals.map((s) => ({
      sourceId: s.sourceId,
      providerId: s.providerId,
      snapshotId: newSnapshot!.id,
      signalType: s.signalType,
      suggestedEventType: s.suggestedEventType,
      sourceType: s.sourceType,
      entity: s.entity,
      title: s.title,
      description: s.description,
      evidence: s.evidence,
      confidenceContribution: s.confidenceContribution,
      detectedAt: s.detectedAt,
      correlated: false,
    })),
  );

  console.log(
    `[pipeline] ${allSignals.length} signal(s) from ${provider.name}/${source.name}: ` +
      allSignals.map((s) => s.signalType).join(", "),
  );

  return { sourceId: source.id, status: "changed", signalsCreated: allSignals.length, fetchUrl };
}
