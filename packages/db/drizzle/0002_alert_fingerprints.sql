CREATE TABLE "alert_fingerprints" (
	"id" serial PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"kind" text NOT NULL,
	"event_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_fingerprints" ADD CONSTRAINT "alert_fingerprints_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "alert_fingerprints_fp_idx" ON "alert_fingerprints" USING btree ("fingerprint");
--> statement-breakpoint
CREATE INDEX "alert_fingerprints_created_idx" ON "alert_fingerprints" USING btree ("created_at");
