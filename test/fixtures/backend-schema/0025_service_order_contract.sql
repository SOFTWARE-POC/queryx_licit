ALTER TABLE "service_orders" ADD COLUMN "licit_id" uuid;--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "contract_id" uuid;--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "estimated_value" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_company_licit_id_uq" UNIQUE("company_id","licit_id","id");--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_licit_fk" FOREIGN KEY ("company_id","licit_id") REFERENCES "public"."licits"("company_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_contract_fk" FOREIGN KEY ("company_id","licit_id","contract_id") REFERENCES "public"."contracts"("company_id","licit_id","id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "service_orders_company_contract_idx" ON "service_orders" USING btree ("company_id","contract_id");--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_estimated_value_ck" CHECK ("service_orders"."estimated_value" is null or "service_orders"."estimated_value" >= 0);--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_licit_contract_ck" CHECK (("service_orders"."licit_id" is null) = ("service_orders"."contract_id" is null));