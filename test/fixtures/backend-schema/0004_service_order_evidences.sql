CREATE TABLE "service_order_evidence_files" (
	"evidence_id" uuid PRIMARY KEY NOT NULL,
	"content" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_order_evidences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"service_order_id" uuid NOT NULL,
	"service_exec_id" uuid,
	"uploaded_by" uuid NOT NULL,
	"phase" text DEFAULT 'DEPOIS' NOT NULL,
	"caption" varchar(300),
	"mime_type" varchar(50) NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"taken_at" timestamp with time zone,
	"latitude" double precision,
	"longitude" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_order_evidences_phase_ck" CHECK ("service_order_evidences"."phase" in ('ANTES', 'DURANTE', 'DEPOIS')),
	CONSTRAINT "service_order_evidences_size_ck" CHECK ("service_order_evidences"."size_bytes" > 0),
	CONSTRAINT "service_order_evidences_geo_ck" CHECK (("service_order_evidences"."latitude" is null) = ("service_order_evidences"."longitude" is null))
);
--> statement-breakpoint
ALTER TABLE "service_execs" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "service_order_evidence_files" ADD CONSTRAINT "service_order_evidence_files_evidence_id_service_order_evidences_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."service_order_evidences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_evidences" ADD CONSTRAINT "service_order_evidences_service_exec_id_service_execs_id_fk" FOREIGN KEY ("service_exec_id") REFERENCES "public"."service_execs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_evidences" ADD CONSTRAINT "service_order_evidences_order_fk" FOREIGN KEY ("company_id","service_order_id") REFERENCES "public"."service_orders"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_evidences" ADD CONSTRAINT "service_order_evidences_user_fk" FOREIGN KEY ("company_id","uploaded_by") REFERENCES "public"."users"("company_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_order_evidences_order_idx" ON "service_order_evidences" USING btree ("company_id","service_order_id","created_at");--> statement-breakpoint
CREATE INDEX "service_order_evidences_exec_idx" ON "service_order_evidences" USING btree ("service_exec_id");