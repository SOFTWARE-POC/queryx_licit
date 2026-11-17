CREATE TABLE "service_order_audio_files" (
	"audio_id" uuid PRIMARY KEY NOT NULL,
	"content" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_order_audios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"service_order_id" uuid NOT NULL,
	"service_exec_id" uuid,
	"uploaded_by" uuid NOT NULL,
	"mime_type" varchar(50) NOT NULL,
	"size_bytes" integer NOT NULL,
	"duration_ms" integer,
	"sha256" varchar(64) NOT NULL,
	"recorded_at" timestamp with time zone,
	"transcription_status" text DEFAULT 'PENDENTE' NOT NULL,
	"transcript" text,
	"transcription_model" varchar(80),
	"transcription_error" varchar(500),
	"transcription_attempts" integer DEFAULT 0 NOT NULL,
	"transcribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_order_audios_transcription_status_ck" CHECK ("service_order_audios"."transcription_status" in ('PENDENTE', 'PROCESSANDO', 'CONCLUIDA', 'FALHOU', 'DESLIGADA')),
	CONSTRAINT "service_order_audios_size_ck" CHECK ("service_order_audios"."size_bytes" > 0),
	CONSTRAINT "service_order_audios_duration_ck" CHECK ("service_order_audios"."duration_ms" is null or "service_order_audios"."duration_ms" > 0)
);
--> statement-breakpoint
ALTER TABLE "service_order_audio_files" ADD CONSTRAINT "service_order_audio_files_audio_id_service_order_audios_id_fk" FOREIGN KEY ("audio_id") REFERENCES "public"."service_order_audios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_audios" ADD CONSTRAINT "service_order_audios_service_exec_id_service_execs_id_fk" FOREIGN KEY ("service_exec_id") REFERENCES "public"."service_execs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_audios" ADD CONSTRAINT "service_order_audios_order_fk" FOREIGN KEY ("company_id","service_order_id") REFERENCES "public"."service_orders"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_audios" ADD CONSTRAINT "service_order_audios_user_fk" FOREIGN KEY ("company_id","uploaded_by") REFERENCES "public"."users"("company_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_order_audios_transcription_idx" ON "service_order_audios" USING btree ("transcription_status","updated_at") WHERE "service_order_audios"."transcription_status" in ('PENDENTE', 'PROCESSANDO', 'FALHOU');--> statement-breakpoint
CREATE INDEX "service_order_audios_order_idx" ON "service_order_audios" USING btree ("company_id","service_order_id","created_at");--> statement-breakpoint
CREATE INDEX "service_order_audios_exec_idx" ON "service_order_audios" USING btree ("service_exec_id");--> statement-breakpoint
-- Áudio de OS atestada também fica como estava (mesma regra das fotos).
CREATE TRIGGER service_order_audios_locked_after_attest
  BEFORE INSERT OR UPDATE OR DELETE ON service_order_audios
  FOR EACH ROW EXECUTE FUNCTION service_order_children_locked_after_attest();
