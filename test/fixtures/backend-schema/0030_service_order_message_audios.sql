CREATE TABLE "service_order_message_audio_files" (
	"message_id" uuid PRIMARY KEY NOT NULL,
	"content" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_order_message_audios" (
	"message_id" uuid PRIMARY KEY NOT NULL,
	"mime_type" varchar(50) NOT NULL,
	"size_bytes" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"waveform" jsonb,
	CONSTRAINT "service_order_message_audios_size_ck" CHECK ("service_order_message_audios"."size_bytes" > 0),
	CONSTRAINT "service_order_message_audios_duration_ck" CHECK ("service_order_message_audios"."duration_ms" between 1 and 300000)
);
--> statement-breakpoint
ALTER TABLE "service_order_messages" DROP CONSTRAINT "service_order_messages_kind_ck";--> statement-breakpoint
ALTER TABLE "service_order_message_audio_files" ADD CONSTRAINT "service_order_message_audio_files_audio_fk" FOREIGN KEY ("message_id") REFERENCES "public"."service_order_message_audios"("message_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_message_audios" ADD CONSTRAINT "service_order_message_audios_message_fk" FOREIGN KEY ("message_id") REFERENCES "public"."service_order_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_messages" ADD CONSTRAINT "service_order_messages_kind_ck" CHECK ("service_order_messages"."kind" in ('MENSAGEM', 'SISTEMA', 'AUDIO'));