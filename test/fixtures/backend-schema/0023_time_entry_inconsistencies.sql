ALTER TABLE "time_entry_adjustments" DROP CONSTRAINT "time_entry_adjustments_action_ck";--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "inconsistencies" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "inconsistency_resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "inconsistency_resolved_by" uuid;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_inconsistency_resolved_by_users_id_fk" FOREIGN KEY ("inconsistency_resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "time_entries_open_inconsistency_idx" ON "time_entries" USING btree ("company_id","timestamp" DESC NULLS LAST) WHERE cardinality("time_entries"."inconsistencies") > 0 and "time_entries"."inconsistency_resolved_at" is null;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_inconsistencies_ck" CHECK ("time_entries"."inconsistencies" <@ array['REPEATED_CLOCK_IN', 'CLOCK_OUT_WITHOUT_CLOCK_IN', 'TOO_CLOSE', 'OUT_OF_ORDER', 'LATE_SYNC', 'DEVICE_CLOCK_AHEAD']::text[]);--> statement-breakpoint
ALTER TABLE "time_entry_adjustments" ADD CONSTRAINT "time_entry_adjustments_action_ck" CHECK ("time_entry_adjustments"."action" in ('ADJUST', 'INVALIDATE', 'RESOLVE'));