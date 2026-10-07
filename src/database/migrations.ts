import { Db, schemaName } from "./db";

/**
 * Migrações do schema do serviço (padrão `relatorios`). Ficam no código (e não
 * em arquivos .sql) para irem junto no build. Cada uma roda uma vez, em
 * transação, registrada em `<schema>.schema_migrations`, com advisory lock para
 * dois deploys não migrarem ao mesmo tempo. NUNCA altere uma migração já
 * publicada: crie outra.
 *
 * `db` precisa ser UMA conexão (pg.Client ou PGlite), por causa da transação.
 */
const MIGRATIONS: Array<{ version: string; statements: (s: string) => string[] }> = [
  {
    version: "001_init",
    statements: (s) => [
      `CREATE TABLE ${s}.reports (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id      uuid NOT NULL,
        name            varchar(120) NOT NULL,
        description     varchar(500) NOT NULL DEFAULT '',
        category        varchar(40) NOT NULL,
        visualization   varchar(20) NOT NULL,
        spec            jsonb NOT NULL,
        default_period  varchar(30),
        created_by      uuid,
        created_by_name varchar(100),
        updated_by      uuid,
        updated_by_name varchar(100),
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT reports_name_ck CHECK (char_length(btrim(name)) BETWEEN 2 AND 120)
      )`,
      `CREATE INDEX reports_company_idx ON ${s}.reports (company_id, lower(name))`,

      `CREATE TABLE ${s}.dashboards (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id      uuid NOT NULL,
        name            varchar(120) NOT NULL,
        description     varchar(500) NOT NULL DEFAULT '',
        default_period  varchar(30) NOT NULL DEFAULT 'last_30_days',
        widgets         jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_by      uuid,
        created_by_name varchar(100),
        updated_by      uuid,
        updated_by_name varchar(100),
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT dashboards_name_ck CHECK (char_length(btrim(name)) BETWEEN 2 AND 120)
      )`,
      `CREATE INDEX dashboards_company_idx ON ${s}.dashboards (company_id, lower(name))`,

      // Envio agendado por e-mail. Roda com as permissões ATUAIS do dono
      // (owner_id) e só manda para quem, na empresa, pode ver o conteúdo.
      `CREATE TABLE ${s}.schedules (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id      uuid NOT NULL,
        name            varchar(120) NOT NULL,
        target_type     varchar(20) NOT NULL,
        target_id       varchar(64) NOT NULL,
        frequency       varchar(10) NOT NULL,
        weekday         smallint,
        month_day       smallint,
        hour            smallint NOT NULL,
        period          varchar(30) NOT NULL,
        format          varchar(5) NOT NULL DEFAULT 'XLSX',
        recipients      jsonb NOT NULL DEFAULT '[]'::jsonb,
        active          boolean NOT NULL DEFAULT true,
        owner_id        uuid NOT NULL,
        owner_name      varchar(100),
        next_run_at     timestamptz NOT NULL,
        claimed_at      timestamptz,
        last_run_at     timestamptz,
        last_status     varchar(10),
        last_error      varchar(500),
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT schedules_target_ck CHECK (target_type IN ('report', 'dashboard')),
        CONSTRAINT schedules_frequency_ck CHECK (frequency IN ('DAILY', 'WEEKLY', 'MONTHLY')),
        CONSTRAINT schedules_weekday_ck CHECK (weekday IS NULL OR weekday BETWEEN 1 AND 7),
        CONSTRAINT schedules_month_day_ck CHECK (month_day IS NULL OR month_day BETWEEN 1 AND 28),
        CONSTRAINT schedules_hour_ck CHECK (hour BETWEEN 0 AND 23),
        CONSTRAINT schedules_format_ck CHECK (format IN ('XLSX', 'CSV'))
      )`,
      `CREATE INDEX schedules_company_idx ON ${s}.schedules (company_id)`,
      `CREATE INDEX schedules_due_idx ON ${s}.schedules (next_run_at) WHERE active`,

      `CREATE TABLE ${s}.schedule_runs (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        schedule_id     uuid NOT NULL REFERENCES ${s}.schedules (id) ON DELETE CASCADE,
        company_id      uuid NOT NULL,
        trigger         varchar(10) NOT NULL,
        status          varchar(10) NOT NULL,
        recipient_count integer NOT NULL DEFAULT 0,
        range_start     date,
        range_end       date,
        error           varchar(500),
        started_at      timestamptz NOT NULL DEFAULT now(),
        finished_at     timestamptz,
        CONSTRAINT schedule_runs_trigger_ck CHECK (trigger IN ('AGENDADO', 'MANUAL')),
        CONSTRAINT schedule_runs_status_ck CHECK (status IN ('OK', 'ERRO', 'IGNORADO'))
      )`,
      `CREATE INDEX schedule_runs_schedule_idx ON ${s}.schedule_runs (schedule_id, started_at DESC)`,
    ],
  },
];

const LOCK_KEY = 72_510_003; // inteiro fixo deste serviço

export async function applyMigrations(
  db: Db,
  rawSchema: string | undefined,
  log: (msg: string) => void = console.log,
): Promise<number> {
  const s = `"${schemaName(rawSchema)}"`;
  await db.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
  try {
    await db.query(`CREATE SCHEMA IF NOT EXISTS ${s}`);
    await db.query(
      `CREATE TABLE IF NOT EXISTS ${s}.schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
    );
    const done = new Set(
      (await db.query<{ version: string }>(`SELECT version FROM ${s}.schema_migrations`)).rows.map((r) => r.version),
    );
    let count = 0;
    for (const m of MIGRATIONS) {
      if (done.has(m.version)) continue;
      log(`[migrate] aplicando ${m.version} em ${s}`);
      await db.query("BEGIN");
      try {
        for (const stmt of m.statements(s)) await db.query(stmt);
        await db.query(`INSERT INTO ${s}.schema_migrations (version) VALUES ($1)`, [m.version]);
        await db.query("COMMIT");
        count++;
      } catch (error) {
        await db.query("ROLLBACK");
        throw new Error(`Falha em ${m.version}: ${(error as Error).message}`);
      }
    }
    log(count ? `[migrate] ${count} migração(ões) aplicada(s)` : `[migrate] schema ${s} em dia`);
    return count;
  } finally {
    await db.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => undefined);
  }
}
