ALTER TABLE "logbook_entries" DROP CONSTRAINT "logbook_entries_service_order_id_service_orders_id_fk";
--> statement-breakpoint
ALTER TABLE "logbook_entries" ADD COLUMN "corrects_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "logbook_entries" ADD COLUMN "correction_reason" text;--> statement-breakpoint
ALTER TABLE "logbook_entries" ADD CONSTRAINT "logbook_entries_company_id_id_uq" UNIQUE("company_id","id");--> statement-breakpoint
ALTER TABLE "logbook_entries" ADD CONSTRAINT "logbook_entries_corrects_fk" FOREIGN KEY ("company_id","corrects_entry_id") REFERENCES "public"."logbook_entries"("company_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logbook_entries" ADD CONSTRAINT "logbook_entries_service_order_id_service_orders_id_fk" FOREIGN KEY ("service_order_id") REFERENCES "public"."service_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "logbook_entries_corrects_idx" ON "logbook_entries" USING btree ("corrects_entry_id");--> statement-breakpoint
ALTER TABLE "logbook_entries" ADD CONSTRAINT "logbook_entries_correction_ck" CHECK (("logbook_entries"."corrects_entry_id" is null and "logbook_entries"."correction_reason" is null)
        or ("logbook_entries"."corrects_entry_id" is not null
            and "logbook_entries"."correction_reason" is not null
            and char_length(btrim("logbook_entries"."correction_reason")) > 0));--> statement-breakpoint
ALTER TABLE "logbook_entries" ADD CONSTRAINT "logbook_entries_corrects_self_ck" CHECK ("logbook_entries"."corrects_entry_id" is distinct from "logbook_entries"."id");