CREATE TABLE "time_clock_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"accepted" boolean NOT NULL,
	"error" varchar(500),
	"time_entry_id" uuid,
	"device_id" varchar(128),
	"ip" varchar(64),
	"user_agent" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_clock_attempts_type_ck" CHECK ("time_clock_attempts"."type" in ('CLOCK_IN', 'CLOCK_OUT'))
);
--> statement-breakpoint
CREATE TABLE "time_entry_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"time_entry_id" uuid NOT NULL,
	"action" text NOT NULL,
	"previous_timestamp" timestamp with time zone NOT NULL,
	"new_timestamp" timestamp with time zone,
	"reason" varchar(500) NOT NULL,
	"performed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_entry_adjustments_action_ck" CHECK ("time_entry_adjustments"."action" in ('ADJUST', 'INVALIDATE'))
);
--> statement-breakpoint
CREATE TABLE "access_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"user_id" uuid,
	"cpf" varchar(14),
	"event" text NOT NULL,
	"ip" varchar(64),
	"user_agent" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_logs_event_ck" CHECK ("access_logs"."event" in ('LOGIN_OK', 'LOGIN_FAIL', 'FACE_LOGIN_OK', 'FACE_LOGIN_FAIL', 'LOGOUT', 'TOKEN_REVOKED')),
	CONSTRAINT "access_logs_subject_ck" CHECK ("access_logs"."user_id" is not null or "access_logs"."cpf" is not null or "access_logs"."event" = 'LOGOUT')
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"actor_id" uuid,
	"actor_name" text,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"ip" varchar(64),
	"user_agent" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_action_ck" CHECK ("audit_log"."action" in ('CREATE', 'UPDATE', 'DELETE'))
);
--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "device_id" varchar(128);--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "ip" varchar(64);--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "user_agent" varchar(500);--> statement-breakpoint
ALTER TABLE "time_clock_attempts" ADD CONSTRAINT "time_clock_attempts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry_adjustments" ADD CONSTRAINT "time_entry_adjustments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry_adjustments" ADD CONSTRAINT "time_entry_adjustments_time_entry_id_time_entries_id_fk" FOREIGN KEY ("time_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "time_clock_attempts_company_user_idx" ON "time_clock_attempts" USING btree ("company_id","user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "time_entry_adjustments_entry_idx" ON "time_entry_adjustments" USING btree ("time_entry_id","created_at");--> statement-breakpoint
CREATE INDEX "access_logs_company_created_idx" ON "access_logs" USING btree ("company_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "access_logs_user_created_idx" ON "access_logs" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_company_created_idx" ON "audit_log" USING btree ("company_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_company_entity_idx" ON "audit_log" USING btree ("company_id","entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_company_actor_idx" ON "audit_log" USING btree ("company_id","actor_id");