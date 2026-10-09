CREATE TABLE "attendance_settings" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"late_tolerance_minutes" integer DEFAULT 10 NOT NULL,
	"early_leave_tolerance_minutes" integer DEFAULT 10 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_settings_tolerances_ck" CHECK ("attendance_settings"."late_tolerance_minutes" between 0 and 240 and "attendance_settings"."early_leave_tolerance_minutes" between 0 and 240)
);
--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "late_tolerance_minutes" integer;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "early_leave_tolerance_minutes" integer;--> statement-breakpoint
ALTER TABLE "attendance_settings" ADD CONSTRAINT "attendance_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_settings" ADD CONSTRAINT "attendance_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_tolerances_ck" CHECK (("schedules"."late_tolerance_minutes" is null or "schedules"."late_tolerance_minutes" between 0 and 240)
        and ("schedules"."early_leave_tolerance_minutes" is null or "schedules"."early_leave_tolerance_minutes" between 0 and 240));