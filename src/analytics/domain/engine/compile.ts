import { addDays, checkRange, resolvePreset } from "../period";
import {
  ColumnAnnotation,
  CompiledQuery,
  CompiledSql,
  Dataset,
  Dimension,
  Filter,
  Measure,
  QueryError,
  QuerySpec,
  SecurityContext,
} from "../types";

export const DEFAULT_LIMIT = 5_000;
export const MAX_LIMIT = 10_000;
export const RECORDS_LIMIT = 500;
export const VALUES_LIMIT = 200;
/** Teto de período dos datasets que geram um dia por linha (escala). */
export const MAX_PERIOD_DAYS = 366;

export interface Catalog {
  get(name: string): Dataset | undefined;
  list(): Dataset[];
}

const GRANULARITY_LABEL = { day: "dia", week: "semana", month: "mês", quarter: "trimestre", year: "ano" } as const;

/**
 * Parâmetros posicionais. `$1` é sempre a empresa e `$2` o fuso; valores do
 * usuário só entram aqui (nunca concatenados no SQL).
 */
class Params {
  readonly values: unknown[];
  constructor(tenantId: string, tz: string) {
    this.values = [tenantId, tz];
  }
  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }

  /**
   * Renumera os placeholders deixando só os usados: o Postgres recusa
   * parâmetro enviado e não referenciado (ex.: o fuso numa consulta sem datas).
   * O SQL do catálogo não usa `$` fora dos placeholders.
   */
  finalize(text: string): CompiledSql {
    const used = [...new Set([...text.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
    const map = new Map(used.map((n, i) => [n, i + 1]));
    return {
      text: text.replace(/\$(\d+)/g, (_, n: string) => `$${map.get(Number(n))}`),
      params: used.map((n) => this.values[n - 1]),
    };
  }
}
const TENANT = "$1::uuid";
const TZ = "$2::text";

const has = <T>(rec: Record<string, T>, key: string): boolean => Object.prototype.hasOwnProperty.call(rec, key);

export function getDataset(catalog: Catalog, name: string): Dataset {
  const ds = catalog.get(name);
  if (!ds) {
    throw new QueryError("unknown-dataset", `O tema '${name}' não existe.`, catalog.list().map((d) => d.name));
  }
  return ds;
}

/** O usuário (ou o dono do agendamento) pode consultar este dataset? */
export function canUseDataset(ds: Dataset, ctx: Pick<SecurityContext, "permissions">): boolean {
  return ds.requires.every((p) => ctx.permissions.includes(p));
}

export function assertDatasetAccess(ds: Dataset, ctx: SecurityContext): void {
  if (!canUseDataset(ds, ctx)) {
    throw new QueryError("forbidden", `Sem permissão para o tema '${ds.title}'.`);
  }
}

export function getDimension(ds: Dataset, name: string): Dimension {
  if (!has(ds.dimensions, name)) {
    throw new QueryError("unknown-dimension", `'${name}' não existe em '${ds.title}'.`, Object.keys(ds.dimensions));
  }
  return ds.dimensions[name];
}

export function getMeasure(ds: Dataset, name: string): Measure {
  if (!has(ds.measures, name)) {
    throw new QueryError("unknown-measure", `A medida '${name}' não existe em '${ds.title}'.`, Object.keys(ds.measures));
  }
  return ds.measures[name];
}

/** Medidas pedidas + componentes dos ratios (que precisam de agregação própria). */
function expandMeasures(ds: Dataset, requested: string[]): string[] {
  const needed = new Set<string>();
  for (const name of requested) {
    const m = getMeasure(ds, name);
    if (m.kind !== "ratio") {
      needed.add(name);
      continue;
    }
    for (const part of [m.numerator, m.denominator]) {
      if (getMeasure(ds, part).kind === "ratio") {
        throw new QueryError("invalid-catalog", `O índice '${name}' depende de outro índice.`);
      }
      needed.add(part);
    }
  }
  return [...needed];
}

/** Joins na ordem declarada no dataset, com as dependências entre eles. */
function joinSql(ds: Dataset, names: Iterable<string>): string {
  const wanted = new Set<string>();
  const visit = (name: string) => {
    if (wanted.has(name)) return;
    const j = ds.joins?.[name];
    if (!j) throw new QueryError("invalid-catalog", `Join '${name}' não existe em '${ds.name}'.`);
    for (const dep of j.requires ?? []) visit(dep);
    wanted.add(name);
  };
  for (const n of names) visit(n);
  return Object.entries(ds.joins ?? {})
    .filter(([name]) => wanted.has(name))
    .map(([, j]) => j.sql)
    .join("\n");
}

function sourceSql(ds: Dataset, params: Params, range: [string, string] | null): string {
  if (typeof ds.source === "string") return ds.source;
  return ds.source({
    tenant: TENANT,
    tz: TZ,
    start: range ? `${params.add(range[0])}::date` : null,
    end: range ? `${params.add(range[1])}::date` : null,
  });
}

// ---------------------------------------------------------------------------
// Filtros e período
// ---------------------------------------------------------------------------

function castValue(value: string | number | boolean, dim: Dimension, params: Params): string {
  switch (dim.type) {
    case "number": {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new QueryError("invalid-filter-value", `Número inválido: ${String(value)}`);
      return `${params.add(n)}::numeric`;
    }
    case "boolean": {
      const s = String(value);
      if (s !== "true" && s !== "false") throw new QueryError("invalid-filter-value", `Use sim/não em '${dim.title}'.`);
      return `${params.add(s === "true")}::boolean`;
    }
    default:
      return `${params.add(String(value))}::text`;
  }
}

/** Início (inclusivo) e fim (exclusivo) de dias locais, no tipo da dimensão. */
function dayBounds(dim: Dimension, start: string, end: string, params: Params): [string, string] {
  if (dim.type === "date") return [`${params.add(start)}::date`, `${params.add(addDays(end, 1))}::date`];
  return [
    `(${params.add(start)}::date)::timestamp AT TIME ZONE ${TZ}`,
    `(${params.add(addDays(end, 1))}::date)::timestamp AT TIME ZONE ${TZ}`,
  ];
}

function rangeClause(dim: Dimension, range: [string, string], params: Params): string {
  checkRange(range);
  const [from, to] = dayBounds(dim, range[0], range[1], params);
  return `(${dim.sql}) >= ${from} AND (${dim.sql}) < ${to}`;
}

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

function filterClause(f: Filter, ds: Dataset, params: Params): { sql: string; joins: string[] } {
  const dim = getDimension(ds, f.dimension);
  const values = f.values ?? [];
  const needsValue = f.operator !== "set" && f.operator !== "notSet";
  if (needsValue && values.length === 0) {
    throw new QueryError("missing-filter-value", `O filtro em '${dim.title}' precisa de um valor.`);
  }
  const isTime = dim.type === "time" || dim.type === "date";
  // Igualdade compara a chave (id), quando existe; texto compara o rótulo.
  const target = dim.key ?? dim.sql;
  const textual = dim.key ? `(${dim.key})::text` : dim.type === "string" ? `(${dim.sql})::text` : `(${dim.sql})`;
  const joins = dim.joins ?? [];
  const firstDate = () => {
    const v = String(values[0]);
    checkRange([v, v]);
    return v;
  };

  switch (f.operator) {
    case "equals":
    case "notEquals": {
      if (isTime) {
        const days = values.map(String);
        const ors = days.map((d) => `(${rangeClause(dim, [d, d], params)})`).join(" OR ");
        return { sql: f.operator === "equals" ? `(${ors})` : `NOT (${ors})`, joins };
      }
      const list = values.map((v) => castValue(v, dim.key ? { ...dim, type: "string" } : dim, params)).join(", ");
      const sql =
        f.operator === "equals"
          ? `${textual} IN (${list})`
          : `(${textual} NOT IN (${list}) OR ${target} IS NULL)`;
      return { sql, joins };
    }
    case "contains":
    case "notContains": {
      const p = params.add(`%${escapeLike(String(values[0]))}%`);
      const sql =
        f.operator === "contains"
          ? `(${dim.sql})::text ILIKE ${p}`
          : `((${dim.sql})::text NOT ILIKE ${p} OR (${dim.sql}) IS NULL)`;
      return { sql, joins };
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const op = { gt: ">", gte: ">=", lt: "<", lte: "<=" }[f.operator];
      if (isTime) {
        // Datas: "depois de 10/09" = a partir de 11/09; "até 10/09" inclui o dia 10.
        const d = firstDate();
        const [startOfDay, startOfNext] = dayBounds(dim, d, d, params);
        const bound = f.operator === "gt" || f.operator === "lte" ? startOfNext : startOfDay;
        const realOp = f.operator === "gt" ? ">=" : f.operator === "lte" ? "<" : op;
        return { sql: `(${dim.sql}) ${realOp} ${bound}`, joins };
      }
      if (dim.type !== "number") {
        throw new QueryError("invalid-filter", `'${dim.title}' não é numérico para comparar com maior/menor.`);
      }
      return { sql: `(${dim.sql}) ${op} ${castValue(values[0] as number, dim, params)}`, joins };
    }
    case "set":
      return { sql: `${target} IS NOT NULL`, joins };
    case "notSet":
      return { sql: `${target} IS NULL`, joins };
    case "inDateRange": {
      if (!isTime || values.length !== 2) {
        throw new QueryError("invalid-filter", `'entre datas' exige um campo de data e [início, fim].`);
      }
      return { sql: rangeClause(dim, [String(values[0]), String(values[1])], params), joins };
    }
    default:
      throw new QueryError("unknown-operator", `Operador inválido: ${String(f.operator)}`);
  }
}

interface WherePlan {
  clauses: string[];
  joins: string[];
  range: [string, string] | null;
}

/** Período efetivo: o pedido ou, quando o dataset exige, os últimos 30 dias. */
function effectiveRange(spec: Pick<QuerySpec, "timeDimension">, ds: Dataset, tz: string, now?: Date) {
  const range = spec.timeDimension?.range ?? (ds.needsPeriod ? resolvePreset("last_30_days", tz, now) : null);
  if (range) checkRange(range, ds.needsPeriod ? MAX_PERIOD_DAYS : undefined);
  return range ?? null;
}

function buildWhere(
  spec: Pick<QuerySpec, "timeDimension" | "filters">,
  ds: Dataset,
  params: Params,
  range: [string, string] | null,
): WherePlan {
  // Primeiro predicado: SEMPRE a empresa da sessão.
  const clauses = [`t.company_id = ${TENANT}`];
  const joins: string[] = [];
  if (ds.where) clauses.push(`(${ds.where})`);

  if (range) {
    const timeName = spec.timeDimension?.dimension ?? ds.defaultTimeDimension;
    if (!timeName) throw new QueryError("invalid-time-dimension", `'${ds.title}' não tem campo de data.`);
    const dim = getDimension(ds, timeName);
    if (dim.type !== "time" && dim.type !== "date") {
      throw new QueryError("invalid-time-dimension", `'${dim.title}' não é um campo de data.`);
    }
    clauses.push(`(${rangeClause(dim, range, params)})`);
    joins.push(...(dim.joins ?? []));
  }
  for (const f of spec.filters ?? []) {
    const c = filterClause(f, ds, params);
    clauses.push(`(${c.sql})`);
    joins.push(...c.joins);
  }
  return { clauses, joins, range };
}

// ---------------------------------------------------------------------------
// Expressões de saída
// ---------------------------------------------------------------------------

function aggregate(m: Measure): string {
  const filter = "filter" in m && m.filter ? ` FILTER (WHERE ${m.filter})` : "";
  switch (m.kind) {
    case "count":
      return `count(*)${filter}`;
    case "countDistinct":
      return `count(DISTINCT ${m.sql})${filter}`;
    case "sum":
    case "avg":
    case "min":
    case "max":
      return `${m.kind}(${m.sql})${filter}`;
    case "ratio":
      throw new QueryError("invalid-catalog", "Índice não é agregação.");
  }
}

/** Valor de saída de uma dimensão: datas viram `YYYY-MM-DD` (independe do driver). */
function dimensionValue(dim: Dimension): string {
  return dim.type === "date" ? `to_char((${dim.sql}), 'YYYY-MM-DD')` : `(${dim.sql})`;
}

function bucketValue(dim: Dimension, granularity: string): string {
  const unit = `'${granularity}'`; // valor validado contra GRANULARITIES
  if (dim.type === "date") return `to_char(date_trunc(${unit}, (${dim.sql})::timestamp), 'YYYY-MM-DD')`;
  return `to_char(date_trunc(${unit}, (${dim.sql}), ${TZ}) AT TIME ZONE ${TZ}, 'YYYY-MM-DD')`;
}

const q = (name: string) => `"${name}"`; // nomes já validados (a-z0-9_) e conferidos no catálogo

export interface CompileOptions {
  timezone: string;
  /** Relógio injetável (testes). */
  now?: Date;
}

/**
 * Compila uma QuerySpec:
 *
 *   SELECT <saídas> FROM (
 *     SELECT <chaves/rótulos>, <bucket>, <agregações> FROM <origem> <joins>
 *     WHERE t.company_id = $1 AND <fixo> AND <período> AND <filtros>
 *     GROUP BY ...
 *   ) q ORDER BY ... LIMIT n
 *
 * Invariantes (testadas):
 *  1. O primeiro predicado é a empresa da sessão (`$1`).
 *  2. Valores do usuário só entram como parâmetro.
 *  3. Índices são SUM(num)/SUM(den), calculados depois do agrupamento.
 *  4. `limit` tem teto mesmo quando o cliente não manda.
 */
export function compileQuery(spec: QuerySpec, ctx: SecurityContext, catalog: Catalog, options: CompileOptions): CompiledQuery {
  const ds = getDataset(catalog, spec.dataset);
  assertDatasetAccess(ds, ctx);
  if (!spec.measures.length) throw new QueryError("no-measures", "Escolha ao menos uma medida.");

  const params = new Params(ctx.tenantId, options.timezone);
  const range = effectiveRange(spec, ds, options.timezone, options.now);
  const from = sourceSql(ds, params, range);
  const where = buildWhere(spec, ds, params, range);
  const joins = new Set(where.joins);

  const inner: string[] = [];
  const outer: string[] = [];
  const columns: string[] = [];
  const annotation: Record<string, ColumnAnnotation> = {};

  for (const name of spec.dimensions ?? []) {
    const dim = getDimension(ds, name);
    for (const j of dim.joins ?? []) joins.add(j);
    if (dim.key) {
      inner.push(`(${dim.key})::text AS ${q(`k_${name}`)}`);
      outer.push(`q.${q(`k_${name}`)} AS ${q(`${name}__key`)}`);
    }
    inner.push(`${dimensionValue(dim)} AS ${q(`d_${name}`)}`);
    outer.push(`q.${q(`d_${name}`)} AS ${q(name)}`);
    columns.push(name);
    annotation[name] = {
      title: dim.title,
      type: dim.type,
      format: dim.format ?? (dim.type === "date" ? "date" : dim.type === "time" ? "datetime" : null),
      role: "dimension",
      ...(dim.pii ? { pii: true } : {}),
      ...(dim.labels ? { labels: dim.labels } : {}),
      ...(dim.key ? { hasKey: true } : {}),
    };
  }

  let bucketName: string | null = null;
  const td = spec.timeDimension;
  if (td?.granularity) {
    const dim = getDimension(ds, td.dimension);
    if (dim.type !== "time" && dim.type !== "date") {
      throw new QueryError("invalid-time-dimension", `'${dim.title}' não é um campo de data.`);
    }
    for (const j of dim.joins ?? []) joins.add(j);
    bucketName = `${td.dimension}__${td.granularity}`;
    inner.push(`${bucketValue(dim, td.granularity)} AS ${q("b_bucket")}`);
    outer.push(`q.${q("b_bucket")} AS ${q(bucketName)}`);
    columns.push(bucketName);
    annotation[bucketName] = {
      title: `${dim.title} (${GRANULARITY_LABEL[td.granularity]})`,
      type: "date",
      format: "date",
      role: "bucket",
      granularity: td.granularity,
    };
  }

  const groupCount = inner.length;
  for (const name of expandMeasures(ds, spec.measures)) {
    const m = getMeasure(ds, name);
    for (const j of m.joins ?? []) joins.add(j);
    inner.push(`${aggregate(m)} AS ${q(`m_${name}`)}`);
  }
  for (const name of spec.measures) {
    const m = getMeasure(ds, name);
    if (m.kind === "ratio") {
      const num = `q.${q(`m_${m.numerator}`)}`;
      const den = `q.${q(`m_${m.denominator}`)}`;
      outer.push(`CASE WHEN coalesce(${den}, 0) = 0 THEN NULL ELSE (${num})::numeric / (${den}) END AS ${q(name)}`);
    } else {
      outer.push(`q.${q(`m_${name}`)} AS ${q(name)}`);
    }
    columns.push(name);
    annotation[name] = {
      title: m.title,
      type: m.format === "date" || m.format === "datetime" || m.format === "time" ? "time" : "number",
      format: m.format ?? (m.kind === "ratio" ? "percent" : "number"),
      role: "measure",
    };
  }

  // Ordem: a pedida; senão cronológica (com bucket) ou pela primeira medida.
  const order = spec.order?.length
    ? spec.order
    : bucketName
      ? ([[bucketName, "asc"]] as Array<[string, "asc" | "desc"]>)
      : spec.dimensions?.length
        ? ([[spec.measures[0], "desc"]] as Array<[string, "asc" | "desc"]>)
        : [];
  const orderSql = order.map(([key, dir]) => {
    if (!columns.includes(key)) {
      throw new QueryError("invalid-order", `Não dá para ordenar por '${key}': não está no resultado.`, columns);
    }
    return `${q(key)} ${dir === "asc" ? "ASC" : "DESC"} NULLS LAST`;
  });

  const limit = Math.min(spec.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const groupBy = groupCount ? `\n  GROUP BY ${Array.from({ length: groupCount }, (_, i) => i + 1).join(", ")}` : "";
  const text = [
    `SELECT ${outer.join(", ")}`,
    `FROM (`,
    `  SELECT ${inner.join(", ")}`,
    `  FROM ${from}`,
    joinSql(ds, joins),
    `  WHERE ${where.clauses.join("\n    AND ")}${groupBy}`,
    `) q`,
    orderSql.length ? `ORDER BY ${orderSql.join(", ")}` : "",
    // +1 para saber se o resultado foi cortado.
    `LIMIT ${limit + 1}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { ...params.finalize(text), annotation, columns, limit, range };
}

// ---------------------------------------------------------------------------
// Detalhamento e valores para filtro
// ---------------------------------------------------------------------------

export interface RecordsSpec {
  dataset: string;
  timeDimension?: { dimension: string; range?: [string, string] };
  filters?: Filter[];
}

export interface CompiledRecords extends CompiledSql {
  columns: string[];
  annotation: Record<string, ColumnAnnotation>;
  linkKind: string | null;
  range: [string, string] | null;
}

/** Os registros que formam um número (clicar numa barra/linha). */
export function compileRecords(
  spec: RecordsSpec,
  ctx: SecurityContext,
  catalog: Catalog,
  options: CompileOptions,
): CompiledRecords {
  const ds = getDataset(catalog, spec.dataset);
  assertDatasetAccess(ds, ctx);
  const params = new Params(ctx.tenantId, options.timezone);
  const range = effectiveRange(spec, ds, options.timezone, options.now);
  const from = sourceSql(ds, params, range);
  const where = buildWhere(spec, ds, params, range);
  const joins = new Set(where.joins);

  const select: string[] = [];
  const annotation: Record<string, ColumnAnnotation> = {};
  for (const name of ds.records.columns) {
    const dim = getDimension(ds, name);
    for (const j of dim.joins ?? []) joins.add(j);
    select.push(`${dimensionValue(dim)} AS ${q(name)}`);
    annotation[name] = {
      title: dim.title,
      type: dim.type,
      format: dim.format ?? (dim.type === "date" ? "date" : dim.type === "time" ? "datetime" : null),
      role: "dimension",
      ...(dim.pii ? { pii: true } : {}),
      ...(dim.labels ? { labels: dim.labels } : {}),
    };
  }
  if (ds.records.link) select.push(`(${ds.records.link.sql})::text AS ${q("__link")}`);

  const text = [
    `SELECT ${select.join(", ")}`,
    `FROM ${from}`,
    joinSql(ds, joins),
    `WHERE ${where.clauses.join("\n  AND ")}`,
    `ORDER BY ${ds.records.order}`,
    `LIMIT ${RECORDS_LIMIT + 1}`,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    ...params.finalize(text),
    columns: [...ds.records.columns],
    annotation,
    linkKind: ds.records.link?.kind ?? null,
    range,
  };
}

export interface ValuesSpec {
  dataset: string;
  dimension: string;
  search?: string;
}

/**
 * Valores existentes de uma dimensão (para escolher no filtro em vez de digitar).
 * Enums e sim/não vêm do catálogo, sem consulta.
 */
export function compileValues(
  spec: ValuesSpec,
  ctx: SecurityContext,
  catalog: Catalog,
  options: CompileOptions,
): CompiledSql | { static: Array<{ value: string; label: string }> } {
  const ds = getDataset(catalog, spec.dataset);
  assertDatasetAccess(ds, ctx);
  const dim = getDimension(ds, spec.dimension);
  if (dim.labels) return { static: Object.entries(dim.labels).map(([value, label]) => ({ value, label })) };
  if (dim.type !== "string") {
    throw new QueryError("invalid-dimension", `'${dim.title}' não tem lista de valores.`);
  }
  const params = new Params(ctx.tenantId, options.timezone);
  // Sem período: a lista mostra o que existe no histórico (com teto).
  const from = sourceSql(ds, params, ds.needsPeriod ? resolvePreset("last_12_months", options.timezone, options.now) : null);
  const clauses = [`t.company_id = ${TENANT}`];
  if (ds.where) clauses.push(`(${ds.where})`);
  clauses.push(`(${dim.sql}) IS NOT NULL`);
  if (spec.search?.trim()) {
    clauses.push(`(${dim.sql})::text ILIKE ${params.add(`%${escapeLike(spec.search.trim())}%`)}`);
  }
  const value = dim.key ? `(${dim.key})::text` : `(${dim.sql})::text`;
  const text = [
    `SELECT ${value} AS "value", min((${dim.sql})::text) AS "label"`,
    `FROM ${from}`,
    joinSql(ds, dim.joins ?? []),
    `WHERE ${clauses.join(" AND ")}`,
    `GROUP BY 1 ORDER BY 2 LIMIT ${VALUES_LIMIT}`,
  ]
    .filter(Boolean)
    .join("\n");
  return params.finalize(text);
}
