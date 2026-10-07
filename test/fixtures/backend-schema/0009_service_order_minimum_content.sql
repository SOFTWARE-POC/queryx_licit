CREATE TABLE "service_order_resources" (
	"company_id" uuid NOT NULL,
	"service_order_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	CONSTRAINT "service_order_resources_pk" PRIMARY KEY("service_order_id","position"),
	CONSTRAINT "service_order_resources_type_ck" CHECK ("service_order_resources"."type" in ('MATERIAL', 'EQUIPAMENTO', 'EQUIPE')),
	CONSTRAINT "service_order_resources_quantity_ck" CHECK ("service_order_resources"."quantity" > 0),
	CONSTRAINT "service_order_resources_description_ck" CHECK (char_length(btrim("service_order_resources"."description")) > 0)
);
--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "estimated_hours" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "estimation_method" text;--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "evaluation_criteria" text;--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "requested_by" uuid;--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "evaluator_id" uuid;--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "attester_id" uuid;--> statement-breakpoint
ALTER TABLE "service_order_resources" ADD CONSTRAINT "service_order_resources_order_fk" FOREIGN KEY ("company_id","service_order_id") REFERENCES "public"."service_orders"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_requested_by_fk" FOREIGN KEY ("company_id","requested_by") REFERENCES "public"."users"("company_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_evaluator_fk" FOREIGN KEY ("company_id","evaluator_id") REFERENCES "public"."users"("company_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_attester_fk" FOREIGN KEY ("company_id","attester_id") REFERENCES "public"."users"("company_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_estimated_hours_ck" CHECK ("service_orders"."estimated_hours" is null or "service_orders"."estimated_hours" > 0);