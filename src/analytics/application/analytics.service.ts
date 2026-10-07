import { Inject, Injectable } from "@nestjs/common";
import { Db, toIso, toNumber } from "../../database/db";
import {
  canUseDataset,
  Catalog,
  compileQuery,
  compileRecords,
  compileValues,
  RecordsSpec,
  RECORDS_LIMIT,
  ValuesSpec,
} from "../domain/engine/compile";
import { ColumnAnnotation, Dataset, QueryResult, QuerySpec, SecurityContext } from "../domain/types";

export const CATALOG = Symbol("CATALOG");
/** Conexões só de leitura (statement_timeout e default_transaction_read_only). */
export const ANALYTICS_DB = Symbol("ANALYTICS_DB");
export const TIMEZONE = Symbol("TIMEZONE");

export interface CatalogView {
  name: string;
  title: string;
  description: string;
  category: string;
  grain: string;
  icon: string;
  defaultTimeDimension: string | null;
  needsPeriod: boolean;
  dimensions: Array<{
    name: string;
    title: string;
    type: string;
    format: string | null;
    groupable: boolean;
    description?: string;
    labels?: Record<string, string>;
    /** Lista de valores para o filtro (enum, sim/não ou busca no banco). */
    values: "static" | "search" | "none";
  }>;
  measures: Array<{ name: string; title: string; format: string | null; description?: string; kind: string }>;
}

export interface RecordsResult {
  data: Array<Record<string, unknown>>;
  columns: string[];
  annotation: Record<string, ColumnAnnotation>;
  linkKind: string | null;
  truncated: boolean;
  range: [string, string] | null;
}

/** Converte o que o driver devolve para JSON estável (números, ISO, texto). */
function normalize(row: Record<string, unknown>, annotation: Record<string, ColumnAnnotation>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const ann = annotation[key];
    if (value === null || value === undefined) out[key] = null;
    else if (key.endsWith("__key") || key === "__link") out[key] = String(value);
    else if (ann?.type === "number") out[key] = toNumber(value);
    else if (ann?.type === "time") out[key] = toIso(value);
    else if (ann?.type === "boolean") out[key] = value === true || value === "t" || value === "true";
    else out[key] = value;
  }
  return out;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(CATALOG) private readonly catalog: Catalog,
    @Inject(ANALYTICS_DB) private readonly db: Db,
    @Inject(TIMEZONE) private readonly timezone: string,
  ) {}

  datasets(ctx: Pick<SecurityContext, "permissions">): Dataset[] {
    return this.catalog.list().filter((d) => canUseDataset(d, ctx));
  }

  dataset(name: string): Dataset | undefined {
    return this.catalog.get(name);
  }

  /** Catálogo para o construtor: só os temas que o usuário pode ver. */
  catalogView(ctx: Pick<SecurityContext, "permissions">): CatalogView[] {
    return this.datasets(ctx).map((d) => ({
      name: d.name,
      title: d.title,
      description: d.description,
      category: d.category,
      grain: d.grain,
      icon: d.icon,
      defaultTimeDimension: d.defaultTimeDimension ?? null,
      needsPeriod: Boolean(d.needsPeriod),
      dimensions: Object.entries(d.dimensions).map(([name, dim]) => ({
        name,
        title: dim.title,
        type: dim.type,
        format: dim.format ?? null,
        groupable: dim.groupable !== false,
        ...(dim.description ? { description: dim.description } : {}),
        ...(dim.labels ? { labels: dim.labels } : {}),
        values: dim.labels ? "static" : dim.type === "string" && dim.groupable !== false ? "search" : "none",
      })),
      measures: Object.entries(d.measures).map(([name, m]) => ({
        name,
        title: m.title,
        format: m.format ?? (m.kind === "ratio" ? "percent" : null),
        kind: m.kind,
        ...(m.description ? { description: m.description } : {}),
      })),
    }));
  }

  /** Só compila (valida nomes e permissão do tema sem ir ao banco). */
  compile(spec: QuerySpec, ctx: SecurityContext): void {
    compileQuery(spec, ctx, this.catalog, { timezone: this.timezone });
  }

  async query(spec: QuerySpec, ctx: SecurityContext, now?: Date): Promise<QueryResult> {
    const compiled = compileQuery(spec, ctx, this.catalog, { timezone: this.timezone, now });
    const started = Date.now();
    const { rows } = await this.db.query<Record<string, unknown>>(compiled.text, compiled.params);
    const truncated = rows.length > compiled.limit;
    const data = (truncated ? rows.slice(0, compiled.limit) : rows).map((r) => normalize(r, compiled.annotation));
    return {
      data,
      annotation: compiled.annotation,
      columns: compiled.columns,
      meta: { durationMs: Date.now() - started, rowCount: data.length, truncated, range: compiled.range },
    };
  }

  async records(spec: RecordsSpec, ctx: SecurityContext, now?: Date): Promise<RecordsResult> {
    const compiled = compileRecords(spec, ctx, this.catalog, { timezone: this.timezone, now });
    const { rows } = await this.db.query<Record<string, unknown>>(compiled.text, compiled.params);
    const truncated = rows.length > RECORDS_LIMIT;
    return {
      data: (truncated ? rows.slice(0, RECORDS_LIMIT) : rows).map((r) => normalize(r, compiled.annotation)),
      columns: compiled.columns,
      annotation: compiled.annotation,
      linkKind: compiled.linkKind,
      truncated,
      range: compiled.range,
    };
  }

  async values(spec: ValuesSpec, ctx: SecurityContext): Promise<Array<{ value: string; label: string }>> {
    const compiled = compileValues(spec, ctx, this.catalog, { timezone: this.timezone });
    if ("static" in compiled) return compiled.static;
    const { rows } = await this.db.query<{ value: unknown; label: unknown }>(compiled.text, compiled.params);
    return rows.map((r) => ({ value: String(r.value), label: String(r.label) }));
  }
}
