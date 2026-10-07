import { Dataset, Granularity, Measure, MongoExpr, PipelineStage, QueryError, QuerySpec } from "../types";

/** Resolve uma medida pelo nome ou lança erro com a lista disponível. */
export function resolveMeasure(ds: Dataset, name: string): Measure {
  const m = Object.prototype.hasOwnProperty.call(ds.measures, name) ? ds.measures[name] : undefined;
  if (!m) {
    throw new QueryError(
      "unknown-measure",
      `Medida '${name}' não existe no dataset '${ds.name}'.`,
      Object.keys(ds.measures),
    );
  }
  return m;
}

/**
 * Expande as medidas pedidas incluindo dependências de ratio.
 *  - requested: o que sai no resultado
 *  - needed: o que precisa de acumulador no $group (inclui num/den de ratios)
 */
export function expandMeasures(ds: Dataset, requested: string[]) {
  const needed = new Set<string>();
  for (const name of requested) {
    const m = resolveMeasure(ds, name);
    if (m.kind === "ratio") {
      for (const part of [m.numerator, m.denominator]) {
        const dep = resolveMeasure(ds, part);
        if (dep.kind === "ratio") {
          throw new QueryError("invalid-catalog", `Ratio '${name}' depende de outro ratio.`);
        }
        needed.add(part);
      }
    } else {
      needed.add(name);
    }
  }
  return { requested, needed: [...needed] };
}

/** Chave de saída do bucket de tempo. Sem ponto: `.` em nome de campo é caminho
 * aninhado no Mongo e quebra o `$group`/`$project`. */
export function timeKey(dimension: string, granularity: Granularity): string {
  return `${dimension}__${granularity}`;
}

const distinctTmp = (name: string) => `__distinct_${name}`;

function valueOf(m: { field?: string; expr?: MongoExpr }, name: string): MongoExpr | string {
  if (m.expr) return m.expr;
  if (m.field) return `$${m.field}`;
  throw new QueryError("invalid-catalog", `Medida '${name}' sem 'field' nem 'expr'.`);
}

function accumulator(name: string, m: Measure): Record<string, unknown> {
  switch (m.kind) {
    case "count": {
      const one = m.filter ? { $cond: [m.filter, 1, 0] } : 1;
      return { [name]: { $sum: one } };
    }
    case "sum": {
      const v = valueOf(m, name);
      return { [name]: { $sum: m.filter ? { $cond: [m.filter, v, 0] } : v } };
    }
    case "avg":
    case "min":
    case "max": {
      // Fora do filtro vira null, que $avg/$min/$max ignoram.
      const v = valueOf(m, name);
      return { [name]: { [`$${m.kind}`]: m.filter ? { $cond: [m.filter, v, null] } : v } };
    }
    case "countDistinct": {
      const v = valueOf(m, name);
      return { [distinctTmp(name)]: { $addToSet: m.filter ? { $cond: [m.filter, v, "$$REMOVE"] } : v } };
    }
    case "ratio":
      return {};
  }
}

function timeBucket(field: string, granularity: Granularity, tz: string): MongoExpr {
  return {
    $dateTrunc: {
      date: `$${field}`,
      unit: granularity,
      timezone: tz,
      ...(granularity === "week" ? { startOfWeek: "monday" } : {}),
    },
  };
}

/** Monta $group e $project e devolve as colunas de saída, na ordem. */
export function buildGroupAndProject(
  spec: QuerySpec,
  ds: Dataset,
  tz: string,
): {
  group: PipelineStage;
  project: PipelineStage;
  outputKeys: string[];
  timeOutputKey: string | null;
} {
  const dimNames = spec.dimensions ?? [];
  const { requested, needed } = expandMeasures(ds, spec.measures);

  const idSpec: Record<string, unknown> = {};
  const outputKeys: string[] = [];

  for (const dn of dimNames) {
    const dim = Object.prototype.hasOwnProperty.call(ds.dimensions, dn) ? ds.dimensions[dn] : undefined;
    if (!dim) {
      throw new QueryError(
        "unknown-dimension",
        `Dimensão '${dn}' não existe no dataset '${ds.name}'.`,
        Object.keys(ds.dimensions),
      );
    }
    // Join tardio: agrupa pela chave local; o valor legível vem do $lookup
    // que roda depois do $group (ver compile.ts).
    idSpec[dn] = dim.lookup?.late ? `$${dim.lookup.localField}` : `$${dim.expr}`;
    outputKeys.push(dn);
  }

  let bucketKey: string | null = null;
  const t = spec.timeDimension;
  if (t?.granularity) {
    const dim = ds.dimensions[t.dimension];
    if (!dim || dim.type !== "time") {
      throw new QueryError("invalid-time-dimension", `'${t.dimension}' não é dimensão de tempo em '${ds.name}'.`);
    }
    bucketKey = timeKey(t.dimension, t.granularity);
    idSpec[bucketKey] = timeBucket(dim.expr, t.granularity, tz);
    outputKeys.push(bucketKey);
  }

  const groupStage: Record<string, unknown> = {
    _id: Object.keys(idSpec).length ? idSpec : null,
  };
  for (const name of needed) Object.assign(groupStage, accumulator(name, resolveMeasure(ds, name)));

  const projectStage: Record<string, unknown> = { _id: 0 };
  for (const dn of dimNames) {
    const dim = ds.dimensions[dn];
    projectStage[dn] = dim.lookup?.late
      ? `$${dim.expr}`
      : dim.type === "id"
        ? { $toString: `$_id.${dn}` }
        : `$_id.${dn}`;
  }
  if (bucketKey) projectStage[bucketKey] = `$_id.${bucketKey}`;

  for (const name of requested) {
    const m = resolveMeasure(ds, name);
    if (m.kind === "ratio") {
      // SUM(num)/SUM(den) — nunca AVG(rate).
      projectStage[name] = {
        $cond: [{ $eq: [`$${m.denominator}`, 0] }, null, { $divide: [`$${m.numerator}`, `$${m.denominator}`] }],
      };
    } else if (m.kind === "countDistinct") {
      projectStage[name] = { $size: `$${distinctTmp(name)}` };
    } else {
      projectStage[name] = `$${name}`;
    }
  }

  return {
    group: { $group: groupStage },
    project: { $project: projectStage },
    outputKeys: [...outputKeys, ...requested],
    timeOutputKey: bucketKey,
  };
}
