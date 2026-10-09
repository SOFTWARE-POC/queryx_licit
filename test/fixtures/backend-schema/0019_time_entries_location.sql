ALTER TABLE "time_entries" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "accuracy_m" real;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "work_site_id" uuid;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "work_site_distance_m" integer;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_work_site_id_work_sites_id_fk" FOREIGN KEY ("work_site_id") REFERENCES "public"."work_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_location_ck" CHECK (("time_entries"."latitude" is null) = ("time_entries"."longitude" is null) and ("time_entries"."latitude" is null or ("time_entries"."latitude" between -90 and 90 and "time_entries"."longitude" between -180 and 180)));