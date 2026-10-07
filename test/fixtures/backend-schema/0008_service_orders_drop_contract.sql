ALTER TABLE "service_orders" DROP CONSTRAINT "service_orders_contract_fk";
--> statement-breakpoint
DROP INDEX "service_orders_company_contract_idx";--> statement-breakpoint
ALTER TABLE "service_orders" DROP COLUMN "contract_id";