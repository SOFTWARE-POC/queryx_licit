CREATE TABLE "service_order_attestations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"service_order_id" uuid NOT NULL,
	"attested_by" uuid NOT NULL,
	"attested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" varchar(1000),
	"content" jsonb NOT NULL,
	"content_sha256" varchar(64) NOT NULL,
	CONSTRAINT "service_order_attestations_order_uq" UNIQUE("service_order_id"),
	CONSTRAINT "service_order_attestations_sha_ck" CHECK ("service_order_attestations"."content_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "attested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "service_order_attestations" ADD CONSTRAINT "service_order_attestations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_attestations" ADD CONSTRAINT "service_order_attestations_order_fk" FOREIGN KEY ("company_id","service_order_id") REFERENCES "public"."service_orders"("company_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_attestations" ADD CONSTRAINT "service_order_attestations_user_fk" FOREIGN KEY ("company_id","attested_by") REFERENCES "public"."users"("company_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Ateste é somente acréscimo: nem por fora da API ele muda ou some.
CREATE OR REPLACE FUNCTION service_order_attestations_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'service_order_attestations é somente acréscimo: % não é permitido', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER service_order_attestations_no_update_delete
  BEFORE UPDATE OR DELETE ON service_order_attestations
  FOR EACH ROW EXECUTE FUNCTION service_order_attestations_append_only();
--> statement-breakpoint
CREATE TRIGGER service_order_attestations_no_truncate
  BEFORE TRUNCATE ON service_order_attestations
  FOR EACH STATEMENT EXECUTE FUNCTION service_order_attestations_append_only();
--> statement-breakpoint
-- OS atestada não muda mais (o hash do ateste deixaria de bater).
CREATE OR REPLACE FUNCTION service_orders_locked_after_attest() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.attested_at IS NOT NULL THEN
    RAISE EXCEPTION 'OS % já foi atestada: % não é permitido', OLD.id, TG_OP
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER service_orders_locked_after_attest
  BEFORE UPDATE OR DELETE ON service_orders
  FOR EACH ROW EXECUTE FUNCTION service_orders_locked_after_attest();
--> statement-breakpoint
-- Execuções e fotos de OS atestada também ficam como estavam.
CREATE OR REPLACE FUNCTION service_order_children_locked_after_attest() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  row_company uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.company_id ELSE NEW.company_id END;
  row_order uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.service_order_id ELSE NEW.service_order_id END;
BEGIN
  IF EXISTS (
    SELECT 1 FROM service_orders o
     WHERE o.company_id = row_company AND o.id = row_order AND o.attested_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'OS % já foi atestada: % em % não é permitido', row_order, TG_OP, TG_TABLE_NAME
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER service_execs_locked_after_attest
  BEFORE INSERT OR UPDATE OR DELETE ON service_execs
  FOR EACH ROW EXECUTE FUNCTION service_order_children_locked_after_attest();
--> statement-breakpoint
CREATE TRIGGER service_order_evidences_locked_after_attest
  BEFORE INSERT OR UPDATE OR DELETE ON service_order_evidences
  FOR EACH ROW EXECUTE FUNCTION service_order_children_locked_after_attest();
