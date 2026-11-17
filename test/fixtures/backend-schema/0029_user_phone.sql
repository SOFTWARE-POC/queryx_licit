ALTER TABLE "users" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_phone_ck" CHECK ("users"."phone" is null or "users"."phone" ~ '^[0-9]{10,11}$');