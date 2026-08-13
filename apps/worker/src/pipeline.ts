import { db, sources as sourcesTable, snapshots as snapshotsTable, signals as signalsTable } from "@ai-radar/db";
import type { providers as providersTable } from "@ai-radar/db";
import { desc, eq } from "drizzle-orm";
import { fetchSource, extractContent, hashContent, diffLines, diffJson, isJsonContentType } from "@ai-radar/crawler";
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
}

export async function processSource(source: SourceRow, provider: ProviderRow): Promise<ProcessResult> {
  const fetchResult = await fetchSource(source.url, {
    etag: source.etag,
    lastModified: source.lastModified,
  });

  const now = new Date();

  if (!fetchResult.ok) {
    await db
      .update(sourcesTable)
      .set({ lastCrawledAt: now, lastStatus: `error: ${fetchResult.error}` })
      .where(eq(sourcesTable.id, source.id));
    return { sourceId: source.id, status: "error", signalsCreated: 0, error: fetchResult.error ?? "unknown" };
  }

  if (fetchResult.notModified) {
    await db
      .update(sourcesTable)
      .set({ lastCrawledAt: now, lastStatus: "ok (304)" })
      .where(eq(sourcesTable.id, source.id));
    return { sourceId: source.id, status: "not_modified", signalsCreated: 0 };
  }

  const body = fetchResult.body ?? "";
  const contentIsJson = isJsonContentType(fetchResult.contentType);
  const extracted = extractContent(body, fetchResult.contentType);
  const contentHash = hashContent(extracted);

  if (extracted.length < MIN_CONTENT_CHARS) {
    // Some client-rendered doc pages intermittently serve an empty shell instead of
    // prerendered HTML — a same-host, same-status blip, not a real content change.
    // Diffing against it would flap the whole page as added/removed on the next real fetch.
    await db
      .update(sourcesTable)
      .set({ lastCrawledAt: now, lastStatus: `error: empty extraction (${extracted.length} chars)` })
      .where(eq(sourcesTable.id, source.id));
    return { sourceId: source.id, status: "error", signalsCreated: 0, error: "empty extraction" };
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
    return { sourceId: source.id, status: "unchanged", signalsCreated: 0 };
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
    // Nothing to diff against yet — this crawl just establishes the baseline.
    return { sourceId: source.id, status: "first_snapshot", signalsCreated: 0 };
  }

  const lineDiff = diffLines(previousSnapshot.extractedContent, extracted);
  if (lineDiff.added.length === 0 && lineDiff.removed.length === 0) {
    return { sourceId: source.id, status: "unchanged", signalsCreated: 0 };
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
    return { sourceId: source.id, status: "changed", signalsCreated: 0 };
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

  return { sourceId: source.id, status: "changed", signalsCreated: allSignals.length };
}
