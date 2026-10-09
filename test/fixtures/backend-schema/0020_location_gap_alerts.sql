CREATE TABLE "location_gap_alerts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"geo_session_id" varchar(64) NOT NULL,
	"lost_since" timestamp with time zone NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"resumed_at" timestamp with time zone,
	"session_ended_at" timestamp with time zone,
	"points_during_gap" integer DEFAULT 0 NOT NULL,
	"acknowledged_by" uuid,
	"acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "location_gap_alerts_points_ck" CHECK ("location_gap_alerts"."points_during_gap" >= 0)
);
--> statement-breakpoint
ALTER TABLE "fence_alert_deliveries" DROP CONSTRAINT "fence_alert_deliveries_source_ck";--> statement-breakpoint
ALTER TABLE "location_gap_alerts" ADD CONSTRAINT "location_gap_alerts_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_gap_alerts" ADD CONSTRAINT "location_gap_alerts_user_fk" FOREIGN KEY ("company_id","user_id") REFERENCES "public"."users"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "location_gap_alerts_company_idx" ON "location_gap_alerts" USING btree ("company_id","detected_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "fence_alert_deliveries" ADD CONSTRAINT "fence_alert_deliveries_source_ck" CHECK ("fence_alert_deliveries"."source" in ('SERVICE_ORDER', 'WORK_SITE', 'LOCATION_GAP'));