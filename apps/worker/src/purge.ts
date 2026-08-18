import {
  db,
  events as eventsTable,
  signals as signalsTable,
  snapshots as snapshotsTable,
  eventSignals as eventSignalsTable,
  alertFingerprints as fingerprintsTable,
} from "@ai-radar/db";
import { and, eq, lt, sql } from "drizzle-orm";
import { RETENTION_MS } from "@ai-radar/shared";

const FINGERPRINT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export interface PurgeSummary {
  events: number;
  signals: number;
  snapshots: number;
  fingerprints: number;
}

/** Drop unstarred data older than 4 days. Starred events and their signals stay. */
export async function purgeStaleData(now: Date = new Date()): Promise<PurgeSummary> {
  const cutoff = new Date(now.getTime() - RETENTION_MS);
  const fpCutoff = new Date(now.getTime() - FINGERPRINT_TTL_MS);

  const goneEvents = await db
    .delete(eventsTable)
    .where(and(lt(eventsTable.firstDetectedAt, cutoff), eq(eventsTable.starred, false)))
    .returning({ id: eventsTable.id });

  const goneSignals = await db
    .delete(signalsTable)
    .where(
      and(
        lt(signalsTable.detectedAt, cutoff),
        sql`${signalsTable.id} NOT IN (SELECT ${eventSignalsTable.signalId} FROM ${eventSignalsTable})`,
      ),
    )
    .returning({ id: signalsTable.id });

  const goneSnapshots = await db
    .delete(snapshotsTable)
    .where(lt(snapshotsTable.fetchedAt, cutoff))
    .returning({ id: snapshotsTable.id });

  const goneFp = await db
    .delete(fingerprintsTable)
    .where(lt(fingerprintsTable.createdAt, fpCutoff))
    .returning({ id: fingerprintsTable.id });

  const summary: PurgeSummary = {
    events: goneEvents.length,
    signals: goneSignals.length,
    snapshots: goneSnapshots.length,
    fingerprints: goneFp.length,
  };

  if (summary.events || summary.signals || summary.snapshots || summary.fingerprints) {
    console.log(
      `[purge] older than ${cutoff.toISOString()} — events=${summary.events} ` +
        `signals=${summary.signals} snapshots=${summary.snapshots} fingerprints=${summary.fingerprints}`,
    );
  } else {
    console.log(`[purge] nothing older than ${cutoff.toISOString()}`);
  }

  return summary;
}
