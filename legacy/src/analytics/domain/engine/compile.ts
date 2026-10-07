import { CompiledQuery, Dataset, PipelineStage, QueryError, QuerySpec, SecurityContext } from "../types";
import { buildDerivedMatch, buildFirstMatch } from "./match";
import { buildGroupAndProject } from "./group";
import { buildAnnotation } from "./annotation";
import { isValidTimezone } from "./zoned-date";

export const DEFAULT_LIMIT = 5000;
export const MAX_LIMIT = 10000;

export interface DatasetLookup {
  get(name: string): Dataset | undefined;
  list(): Dataset[];
}

export interface CompileOptions {
  defaultTimezone: string;
}

/**
 * $lookup (com projeção) + $unwind das dimensões com join, sem repetir joins.
 * `early`: antes do $group, sobre o campo do documento. `late`: depois do $group,
 * sobre a chave de grupo (`_id.<dimensão>`) — ver `Lookup.late`.
 */
function buildLookups(spec: QuerySpec, ds: Dataset, phase: "early" | "late"): PipelineStage[] {
  const stages: PipelineStage[] = [];
  const seen = new Set<string>();
  for (const dn of spec.dimensions ?? []) {
    const lookup = ds.dimensions[dn]?.lookup;
    if (!lookup || Boolean(lookup.late) !== (phase === "late") || seen.has(lookup.as)) continue;
    seen.add(lookup.as);
    const project: Record<string, 1> = {};
    for (const f of lookup.fields) project[f] = 1;
    // Forma `let` + `$expr` (não a concisa localField+pipeline): funciona em
    // qualquer versão e usa o índice de `foreignField` no MongoDB 5+.
    const key = phase === "late" ? `$_id.${dn}` : `$${lookup.localField}`;
    stages.push({
      $lookup: {
        from: lookup.from,
        let: { key },
        pipeline: [
          { $match: { $expr: { $eq: [`$${lookup.foreignField}`, "$$key"] } } },
          { $limit: 1 },
          { $project: project },
        ],
        as: lookup.as,
      },
    });
    stages.push({ $unwind: { path: `$${lookup.as}`, preserveNullAndEmptyArrays: true } });
  }
  return stages;
}

function buildSort(
  spec: QuerySpec,
  outputKeys: string[],
  timeOutputKey: string | null,
): PipelineStage | null {
  if (!spec.order?.length) {
    // Séries temporais saem em ordem cronológica por padrão.
    return timeOutputKey ? { $sort: { [timeOutputKey]: 1 } } : null;
  }
  const sort: Record<string, 1 | -1> = {};
  for (const [key, dir] of spec.order) {
    if (!outputKeys.includes(key)) {
      throw new QueryError("invalid-order", `Não é possível ordenar por '${key}': não está no resultado.`, outputKeys);
    }
    sort[key] = dir === "asc" ? 1 : -1;
  }
  return { $sort: sort };
}

/**
 * Compila uma QuerySpec num aggregation pipeline do Mongo.
 * Ordem: $match(tenant…) → [derivação → $match(período/filtros)] → joins N:1 →
 * $group → joins 1:1 → $project → $sort → $limit.
 *
 * Invariantes (cobertas pelos testes):
 *  1. O primeiro estágio é um $match com o tenant da sessão.
 *  2. Valores do usuário só entram como valores, nunca como código/expressão.
 *  3. Ratios são SUM(num)/SUM(den), resolvidos no $project.
 *  4. `limit` tem teto mesmo quando o cliente não manda.
 *  5. Filtro em dimensão com join é rejeitado.
 */
export function compile(
  spec: QuerySpec,
  ctx: SecurityContext,
  datasets: DatasetLookup,
  options: CompileOptions,
): CompiledQuery {
  const ds = datasets.get(spec.dataset);
  if (!ds) {
    throw new QueryError("unknown-dataset", `Dataset '${spec.dataset}' não existe.`, datasets.list().map((d) => d.name));
  }
  if (!spec.measures?.length) {
    throw new QueryError("no-measures", "É preciso ao menos uma medida.");
  }
  const tz = spec.timezone ?? options.defaultTimezone;
  if (!isValidTimezone(tz)) {
    throw new QueryError("invalid-timezone", `Fuso horário inválido: '${tz}'.`);
  }

  const pipeline: PipelineStage[] = [{ $match: buildFirstMatch(spec, ds, ctx, tz) }];

  if (ds.source) {
    pipeline.push(...ds.source({ timezone: tz }));
    const derived = buildDerivedMatch(spec, ds, tz);
    if (derived) pipeline.push({ $match: derived });
  }

  const { group, project, outputKeys, timeOutputKey } = buildGroupAndProject(spec, ds, tz);
  pipeline.push(
    ...buildLookups(spec, ds, "early"),
    group,
    ...buildLookups(spec, ds, "late"),
    project,
  );

  const sort = buildSort(spec, outputKeys, timeOutputKey);
  if (sort) pipeline.push(sort);
  pipeline.push({ $limit: Math.min(spec.limit ?? DEFAULT_LIMIT, MAX_LIMIT) });

  return {
    collection: ds.collection,
    pipeline,
    annotation: buildAnnotation(spec, ds),
    columns: outputKeys,
  };
}
