-- Protocolo sequencial da OS por empresa (#1, #2...), usado no painel (abas e busca).
CREATE TABLE "service_order_protocol_counters" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"last_protocol" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "protocol" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "service_order_protocol_counters" ADD CONSTRAINT "service_order_protocol_counters_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Numera as OS existentes pela ordem de criação. As OS atestadas são travadas por
-- trigger; o protocolo não entra no hash do ateste, então a trava sai só aqui.
ALTER TABLE "service_orders" DISABLE TRIGGER "service_orders_locked_after_attest";--> statement-breakpoint
UPDATE "service_orders" so
   SET "protocol" = n.rn
  FROM (
    SELECT "id", row_number() OVER (PARTITION BY "company_id" ORDER BY "created_at", "id") AS rn
      FROM "service_orders"
  ) n
 WHERE so."id" = n."id";--> statement-breakpoint
ALTER TABLE "service_orders" ENABLE TRIGGER "service_orders_locked_after_attest";--> statement-breakpoint
INSERT INTO "service_order_protocol_counters" ("company_id", "last_protocol")
  SELECT "company_id", max("protocol") FROM "service_orders" GROUP BY "company_id";--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_company_protocol_uq" UNIQUE("company_id","protocol");--> statement-breakpoint
-- Toda OS nova recebe o próximo número da empresa. O upsert no contador trava a
-- linha da empresa até o fim da transação, então inserts concorrentes não colidem.
-- O valor enviado no INSERT é ignorado.
CREATE OR REPLACE FUNCTION service_orders_assign_protocol() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO service_order_protocol_counters (company_id, last_protocol)
    VALUES (NEW.company_id, 1)
    ON CONFLICT (company_id)
    DO UPDATE SET last_protocol = service_order_protocol_counters.last_protocol + 1
    RETURNING last_protocol INTO NEW.protocol;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER service_orders_assign_protocol
  BEFORE INSERT ON service_orders
  FOR EACH ROW EXECUTE FUNCTION service_orders_assign_protocol();
--> statement-breakpoint
-- O protocolo não muda depois de atribuído.
CREATE OR REPLACE FUNCTION service_orders_protocol_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'O protocolo da OS % não pode ser alterado', OLD.id
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER service_orders_protocol_immutable
  BEFORE UPDATE OF "protocol" ON service_orders
  FOR EACH ROW WHEN (NEW.protocol IS DISTINCT FROM OLD.protocol)
  EXECUTE FUNCTION service_orders_protocol_immutable();
