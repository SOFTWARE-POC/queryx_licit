CREATE TABLE "service_order_message_reads" (
	"company_id" uuid NOT NULL,
	"service_order_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_seq" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_order_message_reads_pk" PRIMARY KEY("service_order_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "service_order_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "service_order_messages_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"company_id" uuid NOT NULL,
	"service_order_id" uuid NOT NULL,
	"kind" text DEFAULT 'MENSAGEM' NOT NULL,
	"author_id" uuid,
	"author_name" varchar(100) NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_order_messages_seq_uq" UNIQUE("seq"),
	CONSTRAINT "service_order_messages_kind_ck" CHECK ("service_order_messages"."kind" in ('MENSAGEM', 'SISTEMA')),
	CONSTRAINT "service_order_messages_body_ck" CHECK (char_length("service_order_messages"."body") between 1 and 4000)
);
--> statement-breakpoint
ALTER TABLE "service_order_message_reads" ADD CONSTRAINT "service_order_message_reads_order_fk" FOREIGN KEY ("company_id","service_order_id") REFERENCES "public"."service_orders"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_message_reads" ADD CONSTRAINT "service_order_message_reads_user_fk" FOREIGN KEY ("company_id","user_id") REFERENCES "public"."users"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_messages" ADD CONSTRAINT "service_order_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_messages" ADD CONSTRAINT "service_order_messages_order_fk" FOREIGN KEY ("company_id","service_order_id") REFERENCES "public"."service_orders"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_order_messages_order_seq_idx" ON "service_order_messages" USING btree ("service_order_id","seq");--> statement-breakpoint
-- Mensagem da OS não se altera (registro da OS). Excluir só junto com a OS
-- (ON DELETE CASCADE), por isso o trigger bloqueia apenas UPDATE.
CREATE OR REPLACE FUNCTION service_order_messages_no_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'service_order_messages não pode ser alterada'
    USING ERRCODE = 'restrict_violation',
          HINT = 'Mensagens da OS são registro: envie uma nova mensagem.';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER service_order_messages_no_update
  BEFORE UPDATE ON service_order_messages
  FOR EACH ROW EXECUTE FUNCTION service_order_messages_no_update();
