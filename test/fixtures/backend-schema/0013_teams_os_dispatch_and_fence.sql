CREATE TABLE "service_order_fence_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"service_order_id" uuid NOT NULL,
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
	CONSTRAINT "service_order_fence_events_client_uq" UNIQUE("user_id","client_event_id"),
	CONSTRAINT "service_order_fence_events_type_ck" CHECK ("service_order_fence_events"."type" in ('SAIDA', 'RETORNO'))
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"company_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_pk" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" varchar(500),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_company_id_id_uq" UNIQUE("company_id","id")
);
--> statement-breakpoint
ALTER TABLE "service_order_assignees" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "service_order_assignees" ADD COLUMN "acceptance" text DEFAULT 'PENDENTE' NOT NULL;--> statement-breakpoint
ALTER TABLE "service_order_assignees" ADD COLUMN "responded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "service_order_assignees" ADD COLUMN "decline_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "fence_lat" double precision;--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "fence_lng" double precision;--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "fence_radius_m" integer;--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "fence_address" varchar(300);--> statement-breakpoint
ALTER TABLE "service_order_fence_events" ADD CONSTRAINT "service_order_fence_events_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_fence_events" ADD CONSTRAINT "service_order_fence_events_order_fk" FOREIGN KEY ("company_id","service_order_id") REFERENCES "public"."service_orders"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_fence_events" ADD CONSTRAINT "service_order_fence_events_user_fk" FOREIGN KEY ("company_id","user_id") REFERENCES "public"."users"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_fk" FOREIGN KEY ("company_id","team_id") REFERENCES "public"."teams"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_fk" FOREIGN KEY ("company_id","user_id") REFERENCES "public"."users"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_order_fence_events_company_idx" ON "service_order_fence_events" USING btree ("company_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "service_order_fence_events_order_idx" ON "service_order_fence_events" USING btree ("service_order_id","occurred_at");--> statement-breakpoint
CREATE INDEX "team_members_user_idx" ON "team_members" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_company_name_uq" ON "teams" USING btree ("company_id",lower("name"));--> statement-breakpoint
ALTER TABLE "service_order_assignees" ADD CONSTRAINT "service_order_assignees_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_assignees" ADD CONSTRAINT "service_order_assignees_acceptance_ck" CHECK ("service_order_assignees"."acceptance" in ('PENDENTE', 'ACEITA', 'RECUSADA'));--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_fence_ck" CHECK (("service_orders"."fence_lat" is null) = ("service_orders"."fence_lng" is null) and ("service_orders"."fence_lat" is null) = ("service_orders"."fence_radius_m" is null) and ("service_orders"."fence_lat" is null or ("service_orders"."fence_lat" between -90 and 90 and "service_orders"."fence_lng" between -180 and 180 and "service_orders"."fence_radius_m" between 20 and 5000)));--> statement-breakpoint
-- Atribuições anteriores ao aceite já estavam valendo: contam como aceitas.
UPDATE "service_order_assignees" SET "acceptance" = 'ACEITA', "responded_at" = "created_at";
