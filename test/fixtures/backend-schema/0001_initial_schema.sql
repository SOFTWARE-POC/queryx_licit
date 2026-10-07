CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"razao_social" varchar(200) NOT NULL,
	"password" text NOT NULL,
	"email" text NOT NULL,
	"telephone" text NOT NULL,
	"cep" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flag_overrides" (
	"flag_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"enabled" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_flag_overrides_pk" PRIMARY KEY("flag_id","company_id")
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(64) NOT NULL,
	"description" varchar(300),
	"enabled_global" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_flags_key_uq" UNIQUE("key"),
	CONSTRAINT "feature_flags_key_ck" CHECK ("feature_flags"."key" ~ '^[a-z0-9_]+$')
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_key_uq" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_uq" UNIQUE("name"),
	CONSTRAINT "roles_name_ck" CHECK ("roles"."name" in ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'WORKER'))
);
--> statement-breakpoint
CREATE TABLE "user_cbos" (
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"cbo_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_cbos_pk" PRIMARY KEY("user_id","cbo_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"password" text NOT NULL,
	"profile" text DEFAULT 'TABLE' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"token_version" integer DEFAULT 0 NOT NULL,
	"email" text NOT NULL,
	"cpf" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_company_id_id_uq" UNIQUE("company_id","id"),
	CONSTRAINT "users_profile_ck" CHECK ("users"."profile" in ('TABLE')),
	CONSTRAINT "users_token_version_ck" CHECK ("users"."token_version" >= 0),
	CONSTRAINT "users_cpf_ck" CHECK ("users"."cpf" ~ '^[0-9]{11}$'),
	CONSTRAINT "users_name_ck" CHECK (char_length("users"."name") >= 2)
);
--> statement-breakpoint
CREATE TABLE "cbos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"titulo" text NOT NULL,
	"grande_grupo" text,
	"sub_grupo_principal" text,
	"sub_grupo" text,
	"familia" text,
	"sinonimos" text[] DEFAULT '{}'::text[] NOT NULL,
	"descricao" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cbos_codigo_uq" UNIQUE("codigo"),
	CONSTRAINT "cbos_codigo_ck" CHECK ("cbos"."codigo" ~ '^[0-9]{6}$')
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"licit_id" uuid NOT NULL,
	"num_contract" text NOT NULL,
	"date_init" timestamp with time zone NOT NULL,
	"date_end" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"price_contract" numeric(15, 2) NOT NULL,
	"file" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_company_id_id_uq" UNIQUE("company_id","id"),
	CONSTRAINT "contracts_company_number_uq" UNIQUE("company_id","num_contract"),
	CONSTRAINT "contracts_status_ck" CHECK ("contracts"."status" in ('ACTIVE', 'INACTIVE'))
);
--> statement-breakpoint
CREATE TABLE "licits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"number_licit" text NOT NULL,
	"org" text NOT NULL,
	"modality" text NOT NULL,
	"value_estim" numeric(15, 2) NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "licits_company_id_id_uq" UNIQUE("company_id","id"),
	CONSTRAINT "licits_company_number_uq" UNIQUE("company_id","number_licit"),
	CONSTRAINT "licits_status_ck" CHECK ("licits"."status" in ('OPEN', 'FINISH'))
);
--> statement-breakpoint
CREATE TABLE "logbook_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"service_order_id" uuid,
	"date" timestamp with time zone NOT NULL,
	"tipo" text NOT NULL,
	"titulo" varchar(150) NOT NULL,
	"descricao" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "logbook_entries_tipo_ck" CHECK ("logbook_entries"."tipo" in ('NOTA', 'OCORRENCIA', 'OBSERVACAO'))
);
--> statement-breakpoint
CREATE TABLE "pop_steps" (
	"pop_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"ordem" integer NOT NULL,
	"descricao" text NOT NULL,
	"obrigatorio" boolean NOT NULL,
	CONSTRAINT "pop_steps_pk" PRIMARY KEY("pop_id","position")
);
--> statement-breakpoint
CREATE TABLE "pops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"descricao" text NOT NULL,
	"setor" text NOT NULL,
	"responsavel_id" uuid NOT NULL,
	"status" text DEFAULT 'ATIVO' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pops_company_id_id_uq" UNIQUE("company_id","id"),
	CONSTRAINT "pops_status_ck" CHECK ("pops"."status" in ('ATIVO', 'INATIVO'))
);
--> statement-breakpoint
CREATE TABLE "schedule_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"action" text NOT NULL,
	"performed_by" uuid,
	"previous_value" jsonb,
	"new_value" jsonb,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_audits_action_ck" CHECK ("schedule_audits"."action" in ('CREATED', 'UPDATED', 'WORKER_ADDED', 'WORKER_REMOVED', 'STATUS_CHANGED', 'SHIFT_UPDATED'))
);
--> statement-breakpoint
CREATE TABLE "schedule_worker_shifts" (
	"schedule_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"day" text NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"break_minutes" integer DEFAULT 0 NOT NULL,
	"notes" text,
	CONSTRAINT "schedule_worker_shifts_pk" PRIMARY KEY("schedule_id","user_id","position"),
	CONSTRAINT "schedule_worker_shifts_day_ck" CHECK ("schedule_worker_shifts"."day" in ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY')),
	CONSTRAINT "schedule_worker_shifts_break_ck" CHECK ("schedule_worker_shifts"."break_minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "schedule_workers" (
	"company_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	CONSTRAINT "schedule_workers_pk" PRIMARY KEY("schedule_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"shift_type" text NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone,
	"start_time" time,
	"end_time" time,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedules_company_id_id_uq" UNIQUE("company_id","id"),
	CONSTRAINT "schedules_status_ck" CHECK ("schedules"."status" in ('ACTIVE', 'INACTIVE', 'DRAFT', 'CANCELLED')),
	CONSTRAINT "schedules_shift_type_ck" CHECK ("schedules"."shift_type" in ('MORNING', 'AFTERNOON', 'NIGHT', 'FULL_DAY', 'CUSTOM')),
	CONSTRAINT "schedules_name_ck" CHECK (char_length("schedules"."name") >= 3)
);
--> statement-breakpoint
CREATE TABLE "service_execs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"service_order_id" uuid NOT NULL,
	"executed_by" uuid NOT NULL,
	"executed_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'PENDENTE' NOT NULL,
	"priority" integer DEFAULT 2 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_execs_company_id_id_uq" UNIQUE("company_id","id"),
	CONSTRAINT "service_execs_status_ck" CHECK ("service_execs"."status" in ('PENDENTE', 'EM_EXECUCAO', 'CONCLUIDA', 'CANCELADA')),
	CONSTRAINT "service_execs_priority_ck" CHECK ("service_execs"."priority" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "service_order_assignees" (
	"company_id" uuid NOT NULL,
	"service_order_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_order_assignees_pk" PRIMARY KEY("service_order_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "service_order_pops" (
	"company_id" uuid NOT NULL,
	"service_order_id" uuid NOT NULL,
	"pop_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "service_order_pops_pk" PRIMARY KEY("service_order_id","pop_id")
);
--> statement-breakpoint
CREATE TABLE "service_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"type_service" text NOT NULL,
	"description" text NOT NULL,
	"date_prev" timestamp with time zone NOT NULL,
	"date_init" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'PENDENTE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_orders_company_id_id_uq" UNIQUE("company_id","id"),
	CONSTRAINT "service_orders_status_ck" CHECK ("service_orders"."status" in ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'))
);
--> statement-breakpoint
CREATE TABLE "service_validations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"service_exec_id" uuid NOT NULL,
	"validated_by" uuid,
	"status" text DEFAULT 'APROVADO' NOT NULL,
	"rejected_mot" text DEFAULT 'NONE' NOT NULL,
	"validated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"schedule_id" uuid,
	"type" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'API' NOT NULL,
	"status" text DEFAULT 'VALID' NOT NULL,
	"notes" varchar(500),
	"adjusted_by" uuid,
	"adjusted_reason" varchar(500),
	"original_timestamp" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_entries_type_ck" CHECK ("time_entries"."type" in ('CLOCK_IN', 'CLOCK_OUT')),
	CONSTRAINT "time_entries_source_ck" CHECK ("time_entries"."source" in ('MANUAL', 'API', 'FACE')),
	CONSTRAINT "time_entries_status_ck" CHECK ("time_entries"."status" in ('VALID', 'ADJUSTED', 'INVALIDATED'))
);
--> statement-breakpoint
ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_flag_id_feature_flags_id_fk" FOREIGN KEY ("flag_id") REFERENCES "public"."feature_flags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_cbos" ADD CONSTRAINT "user_cbos_cbo_id_cbos_id_fk" FOREIGN KEY ("cbo_id") REFERENCES "public"."cbos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_cbos" ADD CONSTRAINT "user_cbos_user_fk" FOREIGN KEY ("company_id","user_id") REFERENCES "public"."users"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_licit_fk" FOREIGN KEY ("company_id","licit_id") REFERENCES "public"."licits"("company_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licits" ADD CONSTRAINT "licits_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logbook_entries" ADD CONSTRAINT "logbook_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logbook_entries" ADD CONSTRAINT "logbook_entries_service_order_id_service_orders_id_fk" FOREIGN KEY ("service_order_id") REFERENCES "public"."service_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logbook_entries" ADD CONSTRAINT "logbook_entries_user_fk" FOREIGN KEY ("company_id","user_id") REFERENCES "public"."users"("company_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pop_steps" ADD CONSTRAINT "pop_steps_pop_id_pops_id_fk" FOREIGN KEY ("pop_id") REFERENCES "public"."pops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pops" ADD CONSTRAINT "pops_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pops" ADD CONSTRAINT "pops_responsavel_fk" FOREIGN KEY ("company_id","responsavel_id") REFERENCES "public"."users"("company_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_audits" ADD CONSTRAINT "schedule_audits_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_audits" ADD CONSTRAINT "schedule_audits_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_worker_shifts" ADD CONSTRAINT "schedule_worker_shifts_worker_fk" FOREIGN KEY ("schedule_id","user_id") REFERENCES "public"."schedule_workers"("schedule_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_workers" ADD CONSTRAINT "schedule_workers_schedule_fk" FOREIGN KEY ("company_id","schedule_id") REFERENCES "public"."schedules"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_workers" ADD CONSTRAINT "schedule_workers_user_fk" FOREIGN KEY ("company_id","user_id") REFERENCES "public"."users"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_execs" ADD CONSTRAINT "service_execs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_execs" ADD CONSTRAINT "service_execs_order_fk" FOREIGN KEY ("company_id","service_order_id") REFERENCES "public"."service_orders"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_execs" ADD CONSTRAINT "service_execs_user_fk" FOREIGN KEY ("company_id","executed_by") REFERENCES "public"."users"("company_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_assignees" ADD CONSTRAINT "service_order_assignees_order_fk" FOREIGN KEY ("company_id","service_order_id") REFERENCES "public"."service_orders"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_assignees" ADD CONSTRAINT "service_order_assignees_user_fk" FOREIGN KEY ("company_id","user_id") REFERENCES "public"."users"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_pops" ADD CONSTRAINT "service_order_pops_order_fk" FOREIGN KEY ("company_id","service_order_id") REFERENCES "public"."service_orders"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_pops" ADD CONSTRAINT "service_order_pops_pop_fk" FOREIGN KEY ("company_id","pop_id") REFERENCES "public"."pops"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_contract_fk" FOREIGN KEY ("company_id","contract_id") REFERENCES "public"."contracts"("company_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_validations" ADD CONSTRAINT "service_validations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_validations" ADD CONSTRAINT "service_validations_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_validations" ADD CONSTRAINT "service_validations_exec_fk" FOREIGN KEY ("company_id","service_exec_id") REFERENCES "public"."service_execs"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_adjusted_by_users_id_fk" FOREIGN KEY ("adjusted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_user_fk" FOREIGN KEY ("company_id","user_id") REFERENCES "public"."users"("company_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "companies_email_uq" ON "companies" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "feature_flag_overrides_company_idx" ON "feature_flag_overrides" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "role_permissions_permission_idx" ON "role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE INDEX "user_cbos_company_user_idx" ON "user_cbos" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE INDEX "user_cbos_cbo_idx" ON "user_cbos" USING btree ("cbo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_company_email_uq" ON "users" USING btree ("company_id",lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_cpf_uq" ON "users" USING btree ("cpf");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "cbos_ativo_idx" ON "cbos" USING btree ("ativo");--> statement-breakpoint
CREATE INDEX "cbos_grande_grupo_idx" ON "cbos" USING btree ("grande_grupo");--> statement-breakpoint
CREATE INDEX "cbos_sub_grupo_principal_idx" ON "cbos" USING btree ("sub_grupo_principal");--> statement-breakpoint
CREATE INDEX "cbos_sub_grupo_idx" ON "cbos" USING btree ("sub_grupo");--> statement-breakpoint
CREATE INDEX "cbos_familia_ativo_idx" ON "cbos" USING btree ("familia","ativo");--> statement-breakpoint
CREATE INDEX "cbos_titulo_trgm_idx" ON "cbos" USING gin ("titulo" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "cbos_codigo_trgm_idx" ON "cbos" USING gin ("codigo" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "contracts_company_licit_idx" ON "contracts" USING btree ("company_id","licit_id");--> statement-breakpoint
CREATE INDEX "logbook_entries_user_date_idx" ON "logbook_entries" USING btree ("user_id","date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "logbook_entries_company_idx" ON "logbook_entries" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "logbook_entries_service_order_idx" ON "logbook_entries" USING btree ("service_order_id");--> statement-breakpoint
CREATE INDEX "pops_company_responsavel_idx" ON "pops" USING btree ("company_id","responsavel_id");--> statement-breakpoint
CREATE INDEX "schedule_audits_schedule_idx" ON "schedule_audits" USING btree ("company_id","schedule_id");--> statement-breakpoint
CREATE INDEX "schedule_audits_performed_by_idx" ON "schedule_audits" USING btree ("performed_by");--> statement-breakpoint
CREATE INDEX "schedule_audits_action_idx" ON "schedule_audits" USING btree ("action");--> statement-breakpoint
CREATE INDEX "schedule_audits_created_at_idx" ON "schedule_audits" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "schedule_workers_user_idx" ON "schedule_workers" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE INDEX "schedules_company_status_idx" ON "schedules" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "schedules_created_by_idx" ON "schedules" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "schedules_dates_idx" ON "schedules" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "service_execs_order_status_idx" ON "service_execs" USING btree ("service_order_id","status");--> statement-breakpoint
CREATE INDEX "service_execs_executed_by_idx" ON "service_execs" USING btree ("company_id","executed_by");--> statement-breakpoint
CREATE INDEX "service_order_assignees_user_idx" ON "service_order_assignees" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE INDEX "service_order_pops_pop_idx" ON "service_order_pops" USING btree ("company_id","pop_id");--> statement-breakpoint
CREATE INDEX "service_orders_company_status_idx" ON "service_orders" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "service_orders_company_contract_idx" ON "service_orders" USING btree ("company_id","contract_id");--> statement-breakpoint
CREATE INDEX "service_validations_exec_idx" ON "service_validations" USING btree ("company_id","service_exec_id");--> statement-breakpoint
CREATE INDEX "time_entries_company_user_ts_idx" ON "time_entries" USING btree ("company_id","user_id","timestamp" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "time_entries_company_ts_idx" ON "time_entries" USING btree ("company_id","timestamp" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "time_entries_user_status_ts_idx" ON "time_entries" USING btree ("user_id","status","timestamp" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "time_entries_schedule_idx" ON "time_entries" USING btree ("schedule_id");