ALTER TABLE "events" ADD COLUMN "starred" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "starred_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX "events_starred_idx" ON "events" USING btree ("starred");
