import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import {
  PROVIDER_TIERS,
  SOURCE_TYPES,
  SIGNAL_TYPES,
  EVENT_TYPES,
  EVENT_STATUSES,
} from "@ai-radar/shared";

export const providerTierEnum = pgEnum("provider_tier", PROVIDER_TIERS);
export const sourceTypeEnum = pgEnum("source_type", SOURCE_TYPES);
export const signalTypeEnum = pgEnum("signal_type", SIGNAL_TYPES);
export const eventTypeEnum = pgEnum("event_type", EVENT_TYPES);
export const eventStatusEnum = pgEnum("event_status", EVENT_STATUSES);

export const providers = pgTable("providers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  tier: providerTierEnum("tier").notNull().default("tier1"),
  priority: integer("priority").notNull().default(50),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sources = pgTable(
  "sources",
  {
    id: serial("id").primaryKey(),
    providerId: integer("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    type: sourceTypeEnum("type").notNull(),
    crawlIntervalMinutes: integer("crawl_interval_minutes").notNull().default(30),
    enabled: boolean("enabled").notNull().default(true),
    lastCrawledAt: timestamp("last_crawled_at", { withTimezone: true }),
    lastStatus: text("last_status"),
    etag: text("etag"),
    lastModified: text("last_modified"),
    lastContentHash: text("last_content_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sources_provider_url_idx").on(t.providerId, t.url),
    index("sources_enabled_idx").on(t.enabled),
  ],
);

export const snapshots = pgTable(
  "snapshots",
  {
    id: serial("id").primaryKey(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    contentHash: text("content_hash").notNull(),
    extractedContent: text("extracted_content").notNull(),
    statusCode: integer("status_code"),
    diffSummary: jsonb("diff_summary").$type<Record<string, unknown> | null>(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("snapshots_source_fetched_idx").on(t.sourceId, t.fetchedAt)],
);

export const signals = pgTable(
  "signals",
  {
    id: serial("id").primaryKey(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    providerId: integer("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    snapshotId: integer("snapshot_id").references(() => snapshots.id, { onDelete: "set null" }),
    signalType: signalTypeEnum("signal_type").notNull(),
    suggestedEventType: eventTypeEnum("suggested_event_type").notNull(),
    sourceType: sourceTypeEnum("source_type").notNull(),
    entity: text("entity"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull(),
    confidenceContribution: integer("confidence_contribution").notNull(),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
    correlated: boolean("correlated").notNull().default(false),
  },
  (t) => [
    index("signals_provider_detected_idx").on(t.providerId, t.detectedAt),
    index("signals_correlated_idx").on(t.correlated),
  ],
);

export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    providerId: integer("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    type: eventTypeEnum("type").notNull(),
    entity: text("entity"),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    confidence: integer("confidence").notNull(),
    importance: integer("importance").notNull(),
    status: eventStatusEnum("status").notNull().default("PRE_ANNOUNCEMENT"),
    firstDetectedAt: timestamp("first_detected_at", { withTimezone: true }).notNull(),
    officiallyAnnouncedAt: timestamp("officially_announced_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    leadTimeMinutes: integer("lead_time_minutes"),
    alertedAt: timestamp("alerted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("events_status_idx").on(t.status),
    index("events_provider_idx").on(t.providerId),
    index("events_first_detected_idx").on(t.firstDetectedAt),
  ],
);

export const alertFingerprints = pgTable(
  "alert_fingerprints",
  {
    id: serial("id").primaryKey(),
    fingerprint: text("fingerprint").notNull(),
    kind: text("kind").notNull(),
    eventId: integer("event_id").references(() => events.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("alert_fingerprints_fp_idx").on(t.fingerprint),
    index("alert_fingerprints_created_idx").on(t.createdAt),
  ],
);

export const eventSignals = pgTable(
  "event_signals",
  {
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    signalId: integer("signal_id")
      .notNull()
      .references(() => signals.id, { onDelete: "cascade" }),
    contribution: integer("contribution").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.signalId] })],
);

export const providersRelations = relations(providers, ({ many }) => ({
  sources: many(sources),
  events: many(events),
}));

export const sourcesRelations = relations(sources, ({ one, many }) => ({
  provider: one(providers, { fields: [sources.providerId], references: [providers.id] }),
  snapshots: many(snapshots),
  signals: many(signals),
}));

export const snapshotsRelations = relations(snapshots, ({ one }) => ({
  source: one(sources, { fields: [snapshots.sourceId], references: [sources.id] }),
}));

export const signalsRelations = relations(signals, ({ one, many }) => ({
  source: one(sources, { fields: [signals.sourceId], references: [sources.id] }),
  provider: one(providers, { fields: [signals.providerId], references: [providers.id] }),
  snapshot: one(snapshots, { fields: [signals.snapshotId], references: [snapshots.id] }),
  eventSignals: many(eventSignals),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  provider: one(providers, { fields: [events.providerId], references: [providers.id] }),
  eventSignals: many(eventSignals),
}));

export const eventSignalsRelations = relations(eventSignals, ({ one }) => ({
  event: one(events, { fields: [eventSignals.eventId], references: [events.id] }),
  signal: one(signals, { fields: [eventSignals.signalId], references: [signals.id] }),
}));
