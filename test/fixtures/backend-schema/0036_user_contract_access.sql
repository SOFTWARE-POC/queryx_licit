CREATE TABLE "user_contract_access" (
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_contract_access_pk" PRIMARY KEY("user_id","contract_id")
);
--> statement-breakpoint
ALTER TABLE "user_contract_access" ADD CONSTRAINT "user_contract_access_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_contract_access" ADD CONSTRAINT "user_contract_access_user_fk" FOREIGN KEY ("company_id","user_id") REFERENCES "public"."users"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_contract_access" ADD CONSTRAINT "user_contract_access_contract_fk" FOREIGN KEY ("company_id","contract_id") REFERENCES "public"."contracts"("company_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_contract_access_contract_idx" ON "user_contract_access" USING btree ("company_id","contract_id");