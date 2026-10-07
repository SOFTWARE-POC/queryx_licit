ALTER TABLE "roles" DROP CONSTRAINT "roles_name_uq";--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "label" varchar(60);--> statement-breakpoint
UPDATE "roles" SET "label" = CASE "name" WHEN 'SUPER_ADMIN' THEN 'Super Admin' WHEN 'ADMIN' THEN 'Administrador' WHEN 'MANAGER' THEN 'Gestor' ELSE 'Colaborador' END;--> statement-breakpoint
ALTER TABLE "roles" ALTER COLUMN "label" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "roles_system_name_uq" ON "roles" USING btree ("name") WHERE "roles"."company_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "roles_company_label_uq" ON "roles" USING btree ("company_id",lower("label")) WHERE "roles"."company_id" is not null;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_company_not_super_admin_ck" CHECK ("roles"."company_id" is null or "roles"."name" <> 'SUPER_ADMIN');