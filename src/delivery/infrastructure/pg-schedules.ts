import { Inject, Injectable } from "@nestjs/common";
import { PeriodPreset } from "../../analytics/domain/period";
import { DB, Db, isUuid, toIso, toNumber } from "../../database/db";
import { DB_SCHEMA } from "../../reports/application/ports";
import { Author } from "../../reports/domain/report";
import { Directory, DirectoryPerson, ScheduleRepository, ScheduleRun } from "../application/ports";
import { ExportFormat, Frequency, Schedule, ScheduleInput } from "../domain/schedule";

type Row = Record<string, unknown>;
const json = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);
const dateStr = (v: unknown): string | null =>
  v === null || v === undefined ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

function toSchedule(r: Row): Schedule {
  return {
    id: String(r.id),
    companyId: String(r.company_id),
    name: String(r.name),
    targetType: r.target_type as "report" | "dashboard",
    targetId: String(r.target_id),
    frequency: r.frequency as Frequency,
    weekday: toNumber(r.weekday),
    monthDay: toNumber(r.month_day),
    hour: Number(r.hour),
    period: r.period as PeriodPreset,
    format: r.format as ExportFormat,
    recipients: (json(r.recipients) as string[]) ?? [],
    active: Boolean(r.active),
    owner: { id: String(r.owner_id), name: String(r.owner_name ?? "") },
    nextRunAt: toIso(r.next_run_at)!,
    lastRunAt: toIso(r.last_run_at),
    lastStatus: (r.last_status as Schedule["lastStatus"]) ?? null,
    lastError: (r.last_error as string | null) ?? null,
    createdAt: toIso(r.created_at)!,
    updatedAt: toIso(r.updated_at)!,
  };
}

@Injectable()
export class PgScheduleRepository implements ScheduleRepository {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(DB_SCHEMA) private readonly schema: string,
  ) {}

  private get s() {
    return `"${this.schema}"`;
  }

  async list(companyId: string) {
    const { rows } = await this.db.query<Row>(`SELECT * FROM ${this.s}.schedules WHERE company_id = $1 ORDER BY lower(name)`, [
      companyId,
    ]);
    return rows.map(toSchedule);
  }

  async get(companyId: string, id: string) {
    if (!isUuid(id)) return null;
    const { rows } = await this.db.query<Row>(`SELECT * FROM ${this.s}.schedules WHERE company_id = $1 AND id = $2`, [
      companyId,
      id,
    ]);
    return rows[0] ? toSchedule(rows[0]) : null;
  }

  private values(i: ScheduleInput) {
    return [
      i.name,
      i.targetType,
      i.targetId,
      i.frequency,
      i.weekday,
      i.monthDay,
      i.hour,
      i.period,
      i.format,
      JSON.stringify(i.recipients),
      i.active,
    ];
  }

  async create(companyId: string, input: ScheduleInput, owner: Author, next: Date) {
    const { rows } = await this.db.query<Row>(
      `INSERT INTO ${this.s}.schedules (company_id, name, target_type, target_id, frequency, weekday, month_day, hour,
         period, format, recipients, active, owner_id, owner_name, next_run_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15) RETURNING *`,
      [companyId, ...this.values(input), owner.id, owner.name, next.toISOString()],
    );
    return toSchedule(rows[0]);
  }

  async update(companyId: string, id: string, input: ScheduleInput, owner: Author, next: Date) {
    if (!isUuid(id)) return null;
    const { rows } = await this.db.query<Row>(
      `UPDATE ${this.s}.schedules SET name = $3, target_type = $4, target_id = $5, frequency = $6, weekday = $7,
         month_day = $8, hour = $9, period = $10, format = $11, recipients = $12::jsonb, active = $13,
         owner_id = $14, owner_name = $15, next_run_at = $16, updated_at = now()
       WHERE company_id = $1 AND id = $2 RETURNING *`,
      [companyId, id, ...this.values(input), owner.id, owner.name, next.toISOString()],
    );
    return rows[0] ? toSchedule(rows[0]) : null;
  }

  async delete(companyId: string, id: string) {
    if (!isUuid(id)) return false;
    const { rows } = await this.db.query(`DELETE FROM ${this.s}.schedules WHERE company_id = $1 AND id = $2 RETURNING id`, [
      companyId,
      id,
    ]);
    return rows.length > 0;
  }

  async deleteByTarget(companyId: string, targetType: string, targetId: string) {
    const { rows } = await this.db.query(
      `DELETE FROM ${this.s}.schedules WHERE company_id = $1 AND target_type = $2 AND target_id = $3 RETURNING id`,
      [companyId, targetType, targetId],
    );
    return rows.length;
  }

  async claimDue(now: Date, limit: number) {
    // Um envio travado (processo caiu no meio) volta a valer depois de 15 min.
    const { rows } = await this.db.query<Row>(
      `UPDATE ${this.s}.schedules SET claimed_at = $1::timestamptz
        WHERE id IN (SELECT id FROM ${this.s}.schedules
                      WHERE active AND next_run_at <= $1::timestamptz
                        AND (claimed_at IS NULL OR claimed_at < $1::timestamptz - interval '15 minutes')
                      ORDER BY next_run_at LIMIT $2 FOR UPDATE SKIP LOCKED)
        RETURNING *`,
      [now.toISOString(), limit],
    );
    return rows.map(toSchedule);
  }

  async finish(id: string, r: { status: ScheduleRun["status"]; error: string | null; nextRunAt: Date | null }) {
    await this.db.query(
      `UPDATE ${this.s}.schedules SET claimed_at = NULL, last_run_at = now(), last_status = $2, last_error = $3,
         next_run_at = coalesce($4::timestamptz, next_run_at)
       WHERE id = $1`,
      [id, r.status, r.error, r.nextRunAt ? r.nextRunAt.toISOString() : null],
    );
  }

  async addRun(run: Omit<ScheduleRun, "id" | "startedAt" | "finishedAt"> & { scheduleId: string; companyId: string; startedAt: Date }) {
    await this.db.query(
      `INSERT INTO ${this.s}.schedule_runs (schedule_id, company_id, trigger, status, recipient_count, range_start, range_end,
         error, started_at, finished_at)
       VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8, $9, now())`,
      [
        run.scheduleId,
        run.companyId,
        run.trigger,
        run.status,
        run.recipientCount,
        run.range?.[0] ?? null,
        run.range?.[1] ?? null,
        run.error,
        run.startedAt.toISOString(),
      ],
    );
  }

  async runs(companyId: string, scheduleId: string, limit: number): Promise<ScheduleRun[]> {
    const { rows } = await this.db.query<Row>(
      `SELECT * FROM ${this.s}.schedule_runs WHERE company_id = $1 AND schedule_id = $2 ORDER BY started_at DESC LIMIT $3`,
      [companyId, scheduleId, limit],
    );
    return rows.map((r) => ({
      id: String(r.id),
      trigger: r.trigger as ScheduleRun["trigger"],
      status: r.status as ScheduleRun["status"],
      recipientCount: Number(r.recipient_count),
      range: r.range_start ? [dateStr(r.range_start)!, dateStr(r.range_end)!] : null,
      error: (r.error as string | null) ?? null,
      startedAt: toIso(r.started_at)!,
      finishedAt: toIso(r.finished_at),
    }));
  }
}

/**
 * Pessoas da empresa com as permissões efetivas, calculadas como a API
 * principal faz: as do perfil, mais as concedidas, menos as revogadas.
 */
@Injectable()
export class PgDirectory implements Directory {
  constructor(@Inject(DB) private readonly db: Db) {}

  private async select(companyId: string, userId?: string): Promise<DirectoryPerson[]> {
    const { rows } = await this.db.query<Row>(
      `SELECT u.id, u.name, u.email, u.active,
              coalesce((SELECT array_agg(x.k ORDER BY x.k) FROM (
                SELECT p.key AS k FROM public.role_permissions rp
                  JOIN public.permissions p ON p.id = rp.permission_id
                 WHERE rp.role_id = u.role_id
                   AND NOT EXISTS (SELECT 1 FROM public.user_permission_overrides o
                                    WHERE o.user_id = u.id AND o.permission_id = p.id AND NOT o.granted)
                UNION
                SELECT p.key FROM public.user_permission_overrides o
                  JOIN public.permissions p ON p.id = o.permission_id
                 WHERE o.user_id = u.id AND o.granted) x), '{}') AS permissions
         FROM public.users u
        WHERE u.company_id = $1 ${userId ? "AND u.id = $2" : ""}`,
      userId ? [companyId, userId] : [companyId],
    );
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      email: String(r.email ?? ""),
      active: Boolean(r.active),
      permissions: Array.isArray(r.permissions) ? r.permissions.map(String) : parsePgArray(r.permissions),
    }));
  }

  async person(companyId: string, userId: string) {
    if (!isUuid(userId)) return null;
    return (await this.select(companyId, userId))[0] ?? null;
  }

  people(companyId: string) {
    return this.select(companyId);
  }
}

/** `{a,b}` quando o driver não converte o array. */
function parsePgArray(v: unknown): string[] {
  const s = String(v ?? "").replace(/^\{|\}$/g, "");
  return s ? s.split(",").map((x) => x.replace(/^"|"$/g, "")) : [];
}
