ALTER TABLE "time_entries" ADD COLUMN "offline" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "client_entry_id" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX "time_entries_client_entry_uq" ON "time_entries" USING btree ("user_id","client_entry_id") WHERE "time_entries"."client_entry_id" is not null;