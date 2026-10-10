CREATE TABLE "password_policies" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"min_length" integer DEFAULT 10 NOT NULL,
	"require_uppercase" boolean DEFAULT true NOT NULL,
	"require_lowercase" boolean DEFAULT true NOT NULL,
	"require_digit" boolean DEFAULT true NOT NULL,
	"require_symbol" boolean DEFAULT false NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_policies_min_length_ck" CHECK ("password_policies"."min_length" between 8 and 128)
);
--> statement-breakpoint
ALTER TABLE "access_logs" DROP CONSTRAINT "access_logs_event_ck";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "password_policies" ADD CONSTRAINT "password_policies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_logs_cpf_created_idx" ON "access_logs" USING btree ("cpf","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "access_logs_ip_created_idx" ON "access_logs" USING btree ("ip","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_event_ck" CHECK ("access_logs"."event" in ('LOGIN_OK', 'LOGIN_FAIL', 'FACE_LOGIN_OK', 'FACE_LOGIN_FAIL', 'LOGOUT', 'TOKEN_REVOKED', 'LOGIN_LOCKED', 'LOGIN_BLOCKED'));