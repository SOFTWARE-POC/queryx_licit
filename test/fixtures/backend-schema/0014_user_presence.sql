CREATE TABLE "user_presence" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"status" text DEFAULT 'OFFLINE' NOT NULL,
	"note" varchar(120),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_presence_status_ck" CHECK ("user_presence"."status" in ('DISPONIVEL', 'AUSENTE', 'OFFLINE'))
);
--> statement-breakpoint
ALTER TABLE "user_presence" ADD CONSTRAINT "user_presence_user_fk" FOREIGN KEY ("company_id","user_id") REFERENCES "public"."users"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_presence_company_idx" ON "user_presence" USING btree ("company_id");