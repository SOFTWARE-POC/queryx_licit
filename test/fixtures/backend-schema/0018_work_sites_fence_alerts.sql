CREATE TABLE "fence_alert_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"source" text NOT NULL,
	"event_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"recipient" varchar(200) NOT NULL,
	"status" text NOT NULL,
	"error" varchar(500),
	"provider_message_id" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fence_alert_deliveries_source_ck" CHECK ("fence_alert_deliveries"."source" in ('SERVICE_ORDER', 'WORK_SITE')),
	CONSTRAINT "fence_alert_deliveries_channel_ck" CHECK ("fence_alert_deliveries"."channel" in ('EMAIL', 'WHATSAPP')),
	CONSTRAINT "fence_alert_deliveries_status_ck" CHECK ("fence_alert_deliveries"."status" in ('SENT', 'FAILED'))
);
--> statement-breakpoint
CREATE TABLE "fence_alert_settings" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"email_enabled" boolean DEFAULT false NOT NULL,
	"emails" text[] DEFAULT '{}'::text[] NOT NULL,
	"whatsapp_enabled" boolean DEFAULT false NOT NULL,
	"whatsapp_numbers" text[] DEFAULT '{}'::text[] NOT NULL,
	"notify_return" boolean DEFAULT false NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_site_fence_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"client_event_id" varchar(64),
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"accuracy_m" real,
	"distance_m" integer NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"acknowledged_by" uuid,
	"acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_site_fence_events_client_uq" UNIQUE("user_id","client_event_id"),
	CONSTRAINT "work_site_fence_events_type_ck" CHECK ("work_site_fence_events"."type" in ('SAIDA', 'RETORNO'))
);
--> statement-breakpoint
CREATE TABLE "work_site_members" (
	"company_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_site_members_pk" PRIMARY KEY("site_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "work_sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"address" varchar(300),
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"radius_m" integer NOT NULL,
	"polygon" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_sites_company_id_id_uq" UNIQUE("company_id","id"),
	CONSTRAINT "work_sites_name_ck" CHECK (char_length("work_sites"."name") >= 2),
	CONSTRAINT "work_sites_geo_ck" CHECK ("work_sites"."lat" between -90 and 90 and "work_sites"."lng" between -180 and 180 and "work_sites"."radius_m" between 20 and 5000),
	CONSTRAINT "work_sites_polygon_ck" CHECK ("work_sites"."polygon" is null or (jsonb_typeof("work_sites"."polygon") = 'array' and jsonb_array_length("work_sites"."polygon") between 3 and 100))
);
--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "fence_polygon" jsonb;--> statement-breakpoint
ALTER TABLE "fence_alert_deliveries" ADD CONSTRAINT "fence_alert_deliveries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fence_alert_settings" ADD CONSTRAINT "fence_alert_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fence_alert_settings" ADD CONSTRAINT "fence_alert_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_site_fence_events" ADD CONSTRAINT "work_site_fence_events_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_site_fence_events" ADD CONSTRAINT "work_site_fence_events_site_fk" FOREIGN KEY ("company_id","site_id") REFERENCES "public"."work_sites"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_site_fence_events" ADD CONSTRAINT "work_site_fence_events_user_fk" FOREIGN KEY ("company_id","user_id") REFERENCES "public"."users"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_site_members" ADD CONSTRAINT "work_site_members_site_fk" FOREIGN KEY ("company_id","site_id") REFERENCES "public"."work_sites"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_site_members" ADD CONSTRAINT "work_site_members_user_fk" FOREIGN KEY ("company_id","user_id") REFERENCES "public"."users"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_sites" ADD CONSTRAINT "work_sites_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_sites" ADD CONSTRAINT "work_sites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_sites" ADD CONSTRAINT "work_sites_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fence_alert_deliveries_event_idx" ON "fence_alert_deliveries" USING btree ("source","event_id");--> statement-breakpoint
CREATE INDEX "fence_alert_deliveries_company_idx" ON "fence_alert_deliveries" USING btree ("company_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "work_site_fence_events_company_idx" ON "work_site_fence_events" USING btree ("company_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "work_site_fence_events_site_idx" ON "work_site_fence_events" USING btree ("site_id","occurred_at");--> statement-breakpoint
CREATE INDEX "work_site_members_user_idx" ON "work_site_members" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_sites_company_name_uq" ON "work_sites" USING btree ("company_id",lower("name"));--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_fence_polygon_ck" CHECK ("service_orders"."fence_polygon" is null or ("service_orders"."fence_lat" is not null and jsonb_typeof("service_orders"."fence_polygon") = 'array' and jsonb_array_length("service_orders"."fence_polygon") between 3 and 100));