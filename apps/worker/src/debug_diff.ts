import { db, sources as sourcesTable, snapshots as snapshotsTable, providers as providersTable } from "@ai-radar/db";
import { eq, desc, and } from "drizzle-orm";
import { diffLines } from "@ai-radar/crawler";

const targets = [
  { provider: "Anthropic", source: "anthropic-sdk-python releases" },
  { provider: "Google Gemini", source: "Google AI Blog" },
  { provider: "OpenAI", source: "News / Blog" },
];

for (const t of targets) {
  const provider = await db.query.providers.findFirst({ where: eq(providersTable.name, t.provider) });
  if (!provider) { console.log(`[debug] provider not found: ${t.provider}`); continue; }
  const source = await db.query.sources.findFirst({
    where: and(eq(sourcesTable.providerId, provider.id), eq(sourcesTable.name, t.source)),
  });
  if (!source) { console.log(`[debug] source not found: ${t.provider}/${t.source}`); continue; }

  const snaps = await db.query.snapshots.findMany({
    where: eq(snapshotsTable.sourceId, source.id),
    orderBy: [desc(snapshotsTable.fetchedAt)],
    limit: 2,
  });

  if (snaps.length < 2) {
    console.log(`[debug] ${t.provider}/${t.source}: only ${snaps.length} snapshot(s), nothing to diff`);
    continue;
  }

  const [latest, prev] = snaps;
  const d = diffLines(prev!.extractedContent, latest!.extractedContent);
  console.log(`\n=== ${t.provider}/${t.source} (${prev!.fetchedAt.toISOString()} -> ${latest!.fetchedAt.toISOString()}) ===`);
  console.log(`added: ${d.added.length}, removed: ${d.removed.length}`);
  for (const l of d.added.slice(0, 15)) console.log(`+ ${l}`);
  for (const l of d.removed.slice(0, 15)) console.log(`- ${l}`);
}

process.exit(0);
