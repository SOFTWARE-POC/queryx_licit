ALTER TABLE "service_order_message_audios" ADD COLUMN "transcript" text;--> statement-breakpoint
ALTER TABLE "service_order_message_audios" ADD COLUMN "transcript_model" varchar(80);--> statement-breakpoint
ALTER TABLE "service_order_message_audios" ADD COLUMN "transcribed_at" timestamp with time zone;