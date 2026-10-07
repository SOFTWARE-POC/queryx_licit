CREATE TABLE "face_enrollments" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"consent_version" varchar(20) NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"enrolled_at" timestamp with time zone NOT NULL,
	"enrolled_by" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "face_enrollments_status_ck" CHECK ("face_enrollments"."status" in ('ACTIVE', 'REVOKED'))
);
--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "face_confidence" real;--> statement-breakpoint
ALTER TABLE "face_enrollments" ADD CONSTRAINT "face_enrollments_enrolled_by_users_id_fk" FOREIGN KEY ("enrolled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "face_enrollments" ADD CONSTRAINT "face_enrollments_user_fk" FOREIGN KEY ("company_id","user_id") REFERENCES "public"."users"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "face_enrollments_company_idx" ON "face_enrollments" USING btree ("company_id");