CREATE TYPE "public"."event_status" AS ENUM('PRE_ANNOUNCEMENT', 'CONFIRMED', 'DISMISSED');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('MODEL_LAUNCH', 'MODEL_PREVIEW', 'AVAILABILITY_CHANGE', 'CAPABILITY_CHANGE', 'NEW_ENDPOINT', 'API_CHANGE', 'DEV_FEATURE', 'PRODUCT_FEATURE', 'PRICING_CHANGE', 'CONTEXT_WINDOW_CHANGE', 'SDK_CHANGE', 'GITHUB_CHANGE', 'NEW_PRODUCT', 'DEPRECATION', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."provider_tier" AS ENUM('tier1', 'tier2');--> statement-breakpoint
CREATE TYPE "public"."signal_type" AS ENUM('new_model_id', 'new_endpoint', 'sdk_change', 'doc_change', 'pricing_change', 'model_catalog_change', 'github_release', 'capability_change', 'availability_change', 'deprecation', 'product_launch', 'other');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('blog', 'docs', 'changelog', 'model_catalog', 'api_reference', 'pricing', 'github_repo', 'github_releases', 'sdk_npm', 'sdk_pypi', 'product_page', 'social');--> statement-breakpoint
CREATE TABLE "event_signals" (
	"event_id" integer NOT NULL,
	"signal_id" integer NOT NULL,
	"contribution" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "event_signals_event_id_signal_id_pk" PRIMARY KEY("event_id","signal_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_id" integer NOT NULL,
	"type" "event_type" NOT NULL,
	"entity" text,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"confidence" integer NOT NULL,
	"importance" integer NOT NULL,
	"status" "event_status" DEFAULT 'PRE_ANNOUNCEMENT' NOT NULL,
	"first_detected_at" timestamp with time zone NOT NULL,
	"officially_announced_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"lead_time_minutes" integer,
	"alerted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"tier" "provider_tier" DEFAULT 'tier1' NOT NULL,
	"priority" integer DEFAULT 50 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "providers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"provider_id" integer NOT NULL,
	"snapshot_id" integer,
	"signal_type" "signal_type" NOT NULL,
	"source_type" "source_type" NOT NULL,
	"entity" text,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"confidence_contribution" integer NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"correlated" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"content_hash" text NOT NULL,
	"extracted_content" text NOT NULL,
	"status_code" integer,
	"diff_summary" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_id" integer NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"type" "source_type" NOT NULL,
	"crawl_interval_minutes" integer DEFAULT 30 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_crawled_at" timestamp with time zone,
	"last_status" text,
	"etag" text,
	"last_modified" text,
	"last_content_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_signals" ADD CONSTRAINT "event_signals_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_signals" ADD CONSTRAINT "event_signals_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_status_idx" ON "events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "events_provider_idx" ON "events" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "events_first_detected_idx" ON "events" USING btree ("first_detected_at");--> statement-breakpoint
CREATE INDEX "signals_provider_detected_idx" ON "signals" USING btree ("provider_id","detected_at");--> statement-breakpoint
CREATE INDEX "signals_correlated_idx" ON "signals" USING btree ("correlated");--> statement-breakpoint
CREATE INDEX "snapshots_source_fetched_idx" ON "snapshots" USING btree ("source_id","fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_provider_url_idx" ON "sources" USING btree ("provider_id","url");--> statement-breakpoint
CREATE INDEX "sources_enabled_idx" ON "sources" USING btree ("enabled");