import { Inject, Injectable } from "@nestjs/common";
import { isPeriodPreset, PeriodPreset } from "../../analytics/domain/period";
import { DB, Db, isUuid, toIso } from "../../database/db";
import { DashboardRepository, DB_SCHEMA, ReportRepository } from "../application/ports";
import { DashboardDefinition, DashboardInput, Widget } from "../domain/dashboard";
import { Author, ReportDefinition, ReportInput, SavedSpec, Visualization } from "../domain/report";

type Row = Record<string, unknown>;

const json = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);
const author = (id: unknown, name: unknown): Author | null =>
  id ? { id: String(id), name: String(name ?? "") } : null;

function toReport(r: Row): ReportDefinition {
  return {
    id: String(r.id),
    system: false,
    name: String(r.name),
    description: String(r.description ?? ""),
    category: String(r.category),
    visualization: r.visualization as Visualization,
    spec: json(r.spec) as SavedSpec,
    defaultPeriod: isPeriodPreset(r.default_period) ? r.default_period : null,
    createdBy: author(r.created_by, r.created_by_name),
    updatedBy: author(r.updated_by, r.updated_by_name),
    updatedAt: toIso(r.updated_at) ?? undefined,
  };
}

function toDashboard(r: Row): DashboardDefinition {
  return {
    id: String(r.id),
    system: false,
    name: String(r.name),
    description: String(r.description ?? ""),
    defaultPeriod: (isPeriodPreset(r.default_period) ? r.default_period : "last_30_days") as PeriodPreset,
    widgets: json(r.widgets) as Widget[],
    createdBy: author(r.created_by, r.created_by_name),
    updatedBy: author(r.updated_by, r.updated_by_name),
    updatedAt: toIso(r.updated_at) ?? undefined,
  };
}

/** Relatórios criados pela empresa (os prontos ficam no código). */
@Injectable()
export class PgReportRepository implements ReportRepository {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(DB_SCHEMA) private readonly schema: string,
  ) {}

  private get table() {
    return `"${this.schema}".reports`;
  }

  async list(companyId: string) {
    const { rows } = await this.db.query<Row>(
      `SELECT * FROM ${this.table} WHERE company_id = $1 ORDER BY lower(name)`,
      [companyId],
    );
    return rows.map(toReport);
  }

  async get(companyId: string, id: string) {
    if (!isUuid(id)) return null;
    const { rows } = await this.db.query<Row>(`SELECT * FROM ${this.table} WHERE company_id = $1 AND id = $2`, [
      companyId,
      id,
    ]);
    return rows[0] ? toReport(rows[0]) : null;
  }

  async create(companyId: string, input: ReportInput, category: string, by: Author) {
    const { rows } = await this.db.query<Row>(
      `INSERT INTO ${this.table} (company_id, name, description, category, visualization, spec, default_period,
         created_by, created_by_name, updated_by, updated_by_name)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $8, $9) RETURNING *`,
      [
        companyId,
        input.name,
        input.description,
        category,
        input.visualization,
        JSON.stringify(input.spec),
        input.defaultPeriod,
        by.id,
        by.name,
      ],
    );
    return toReport(rows[0]);
  }

  async update(companyId: string, id: string, input: ReportInput, category: string, by: Author) {
    if (!isUuid(id)) return null;
    const { rows } = await this.db.query<Row>(
      `UPDATE ${this.table} SET name = $3, description = $4, category = $5, visualization = $6, spec = $7::jsonb,
         default_period = $8, updated_by = $9, updated_by_name = $10, updated_at = now()
       WHERE company_id = $1 AND id = $2 RETURNING *`,
      [
        companyId,
        id,
        input.name,
        input.description,
        category,
        input.visualization,
        JSON.stringify(input.spec),
        input.defaultPeriod,
        by.id,
        by.name,
      ],
    );
    return rows[0] ? toReport(rows[0]) : null;
  }

  async delete(companyId: string, id: string) {
    if (!isUuid(id)) return false;
    const { rows } = await this.db.query(`DELETE FROM ${this.table} WHERE company_id = $1 AND id = $2 RETURNING id`, [
      companyId,
      id,
    ]);
    return rows.length > 0;
  }
}

@Injectable()
export class PgDashboardRepository implements DashboardRepository {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(DB_SCHEMA) private readonly schema: string,
  ) {}

  private get table() {
    return `"${this.schema}".dashboards`;
  }

  async list(companyId: string) {
    const { rows } = await this.db.query<Row>(
      `SELECT * FROM ${this.table} WHERE company_id = $1 ORDER BY lower(name)`,
      [companyId],
    );
    return rows.map(toDashboard);
  }

  async get(companyId: string, id: string) {
    if (!isUuid(id)) return null;
    const { rows } = await this.db.query<Row>(`SELECT * FROM ${this.table} WHERE company_id = $1 AND id = $2`, [
      companyId,
      id,
    ]);
    return rows[0] ? toDashboard(rows[0]) : null;
  }

  async create(companyId: string, input: DashboardInput, by: Author) {
    const { rows } = await this.db.query<Row>(
      `INSERT INTO ${this.table} (company_id, name, description, default_period, widgets,
         created_by, created_by_name, updated_by, updated_by_name)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $6, $7) RETURNING *`,
      [companyId, input.name, input.description, input.defaultPeriod, JSON.stringify(input.widgets), by.id, by.name],
    );
    return toDashboard(rows[0]);
  }

  async update(companyId: string, id: string, input: DashboardInput, by: Author) {
    if (!isUuid(id)) return null;
    const { rows } = await this.db.query<Row>(
      `UPDATE ${this.table} SET name = $3, description = $4, default_period = $5, widgets = $6::jsonb,
         updated_by = $7, updated_by_name = $8, updated_at = now()
       WHERE company_id = $1 AND id = $2 RETURNING *`,
      [companyId, id, input.name, input.description, input.defaultPeriod, JSON.stringify(input.widgets), by.id, by.name],
    );
    return rows[0] ? toDashboard(rows[0]) : null;
  }

  async delete(companyId: string, id: string) {
    if (!isUuid(id)) return false;
    const { rows } = await this.db.query(`DELETE FROM ${this.table} WHERE company_id = $1 AND id = $2 RETURNING id`, [
      companyId,
      id,
    ]);
    return rows.length > 0;
  }
}
