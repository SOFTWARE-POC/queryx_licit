import { ObjectId } from "mongodb";
import { Dataset, Filter, QueryError, QuerySpec, SecurityContext } from "../types";
import { toInstant, toInstantRange } from "./zoned-date";

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

function toObjectId(value: unknown, what: string): ObjectId {
  if (typeof value === "string" && OBJECT_ID.test(value)) {
    return new ObjectId(value);
  }
  throw new QueryError("invalid-filter-value", `Valor de ${what} inválido: ${String(value)}`);
}

/** Converte um valor do usuário para o tipo do campo. Só vira VALOR, nunca código. */
function castValue(value: string | number, type: string, tz: string): unknown {
  if (type === "id") return toObjectId(value, "id");
  if (type === "time") return toInstant(String(value), tz);
  if (type === "number") {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      throw new QueryError("invalid-filter-value", `Valor numérico inválido: ${String(value)}`);
    }
    return n;
  }
  return String(value);
}

/** Escapa metacaracteres: o texto do usuário é buscado literalmente, sem virar regex
 * (evita injeção de padrão e ReDoS). */
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildFilter(filter: Filter, ds: Dataset, tz: string): Record<string, unknown> {
  const dim = ds.dimensions[filter.dimension];
  if (!dim) {
    throw new QueryError(
      "unknown-dimension",
      `Dimensão '${filter.dimension}' não existe no dataset '${ds.name}'.`,
      Object.keys(ds.dimensions),
    );
  }
  if (dim.lookup) {
    throw new QueryError(
      "filter-on-joined-dimension",
      `Não é possível filtrar por '${filter.dimension}' (exige join). Filtre por um campo direto.`,
    );
  }

  const field = dim.expr;
  const raw = filter.values ?? [];
  const needsValue = !["set", "notSet"].includes(filter.operator);
  if (needsValue && raw.length === 0) {
    throw new QueryError(
      "missing-filter-value",
      `O filtro em '${filter.dimension}' precisa de ao menos um valor.`,
    );
  }

  switch (filter.operator) {
    case "equals":
      return { [field]: { $in: raw.map((v) => castValue(v, dim.type, tz)) } };
    case "notEquals":
      return { [field]: { $nin: raw.map((v) => castValue(v, dim.type, tz)) } };
    case "contains":
      return { [field]: { $regex: escapeRegex(String(raw[0])), $options: "i" } };
    case "notContains":
      return { [field]: { $not: { $regex: escapeRegex(String(raw[0])), $options: "i" } } };
    case "gt":
      return { [field]: { $gt: castValue(raw[0], dim.type, tz) } };
    case "gte":
      return { [field]: { $gte: castValue(raw[0], dim.type, tz) } };
    case "lt":
      return { [field]: { $lt: castValue(raw[0], dim.type, tz) } };
    case "lte":
      return { [field]: { $lte: castValue(raw[0], dim.type, tz) } };
    case "set":
      return { [field]: { $exists: true, $ne: null } };
    case "notSet":
      return { [field]: { $eq: null } };
    case "inDateRange": {
      if (dim.type !== "time" || raw.length !== 2) {
        throw new QueryError(
          "invalid-filter",
          `'inDateRange' exige uma dimensão de tempo e dois valores [início, fim].`,
        );
      }
      return { [field]: toInstantRange([String(raw[0]), String(raw[1])], tz) };
    }
    default:
      throw new QueryError("unknown-operator", `Operador inválido: ${String(filter.operator)}`);
  }
}

function timeDimensionField(spec: QuerySpec, ds: Dataset): string | null {
  const time = spec.timeDimension;
  if (!time) return null;
  const dim = ds.dimensions[time.dimension];
  if (!dim || dim.type !== "time") {
    throw new QueryError(
      "invalid-time-dimension",
      `'${time.dimension}' não é uma dimensão de tempo em '${ds.name}'.`,
      Object.entries(ds.dimensions)
        .filter(([, d]) => d.type === "time")
        .map(([k]) => k),
    );
  }
  return dim.expr;
}

function combine(clauses: Record<string, unknown>[]): Record<string, unknown> {
  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

/**
 * Primeiro `$match` do pipeline — SEMPRE com o tenant (vindo da sessão, nunca do
 * payload). Em datasets diretos, já carrega período e filtros (indexável). Em
 * datasets derivados (`source`), leva só o tenant, o predicado fixo e um recorte
 * folgado do período no campo bruto.
 */
export function buildFirstMatch(
  spec: QuerySpec,
  ds: Dataset,
  ctx: SecurityContext,
  tz: string,
): Record<string, unknown> {
  const clauses: Record<string, unknown>[] = [
    { [ds.tenantField]: toObjectId(ctx.tenantId, "tenant") },
  ];
  if (ds.baseMatch) clauses.push(ds.baseMatch);

  if (ds.source) {
    const range = spec.timeDimension?.range;
    if (range && ds.prefilter) {
      timeDimensionField(spec, ds); // valida a dimensão mesmo sem usá-la aqui
      clauses.push({ [ds.prefilter.field]: toInstantRange(range, tz, ds.prefilter.padDays) });
    }
    return combine(clauses);
  }

  return combine([...clauses, ...buildUserClauses(spec, ds, tz)]);
}

/** Período + filtros do usuário. */
function buildUserClauses(spec: QuerySpec, ds: Dataset, tz: string): Record<string, unknown>[] {
  const clauses: Record<string, unknown>[] = [];
  const field = timeDimensionField(spec, ds);
  if (field && spec.timeDimension?.range) {
    clauses.push({ [field]: toInstantRange(spec.timeDimension.range, tz) });
  }
  for (const f of spec.filters ?? []) clauses.push(buildFilter(f, ds, tz));
  return clauses;
}

/** Em datasets derivados: `$match` do período e filtros sobre os campos derivados. */
export function buildDerivedMatch(
  spec: QuerySpec,
  ds: Dataset,
  tz: string,
): Record<string, unknown> | null {
  const clauses = buildUserClauses(spec, ds, tz);
  return clauses.length ? combine(clauses) : null;
}
