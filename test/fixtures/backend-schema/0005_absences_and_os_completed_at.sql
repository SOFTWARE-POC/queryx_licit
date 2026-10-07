CREATE TABLE "absence_attachment_files" (
	"attachment_id" uuid PRIMARY KEY NOT NULL,
	"content" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "absence_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"absence_request_id" uuid NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"mime_type" varchar(50) NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "absence_attachments_size_ck" CHECK ("absence_attachments"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "absence_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"start_time" time,
	"end_time" time,
	"reason" text NOT NULL,
	"status" text DEFAULT 'PENDENTE' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_notes" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "absence_requests_company_id_id_uq" UNIQUE("company_id","id"),
	CONSTRAINT "absence_requests_type_ck" CHECK ("absence_requests"."type" in ('ATESTADO_MEDICO', 'JUSTIFICATIVA_FALTA', 'SOLICITACAO_AUSENCIA', 'OUTRO')),
	CONSTRAINT "absence_requests_status_ck" CHECK ("absence_requests"."status" in ('PENDENTE', 'APROVADO', 'REJEITADO', 'CANCELADO')),
	CONSTRAINT "absence_requests_dates_ck" CHECK ("absence_requests"."end_date" >= "absence_requests"."start_date"),
	CONSTRAINT "absence_requests_times_ck" CHECK (("absence_requests"."start_time" is null and "absence_requests"."end_time" is null) or ("absence_requests"."start_time" is not null and "absence_requests"."end_time" is not null and "absence_requests"."end_time" > "absence_requests"."start_time" and "absence_requests"."start_date" = "absence_requests"."end_date"))
);
--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
-- OS já concluídas: a melhor aproximação disponível é a última atualização.
UPDATE "service_orders" SET "completed_at" = "updated_at" WHERE "status" = 'CONCLUIDA';--> statement-breakpoint
ALTER TABLE "absence_attachment_files" ADD CONSTRAINT "absence_attachment_files_attachment_id_absence_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."absence_attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absence_attachments" ADD CONSTRAINT "absence_attachments_request_fk" FOREIGN KEY ("company_id","absence_request_id") REFERENCES "public"."absence_requests"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absence_attachments" ADD CONSTRAINT "absence_attachments_user_fk" FOREIGN KEY ("company_id","uploaded_by") REFERENCES "public"."users"("company_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absence_requests" ADD CONSTRAINT "absence_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absence_requests" ADD CONSTRAINT "absence_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absence_requests" ADD CONSTRAINT "absence_requests_user_fk" FOREIGN KEY ("company_id","user_id") REFERENCES "public"."users"("company_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "absence_attachments_request_idx" ON "absence_attachments" USING btree ("company_id","absence_request_id");--> statement-breakpoint
CREATE INDEX "absence_requests_company_status_idx" ON "absence_requests" USING btree ("company_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "absence_requests_user_dates_idx" ON "absence_requests" USING btree ("company_id","user_id","start_date");