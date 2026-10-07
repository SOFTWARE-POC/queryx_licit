import type { CatalogDataset, Filter, Granularity, QuerySpec } from "./types";

export interface Recorte {
  range: [string, string];
  contractId: string | null;
}

/** Datasets que aceitam o recorte por contrato (têm a dimensão `contract_id`). */
export const supportsContract = (ds: CatalogDataset | undefined) =>
  Boolean(ds?.dimensions.some((d) => d.name === "contract_id"));

/**
 * Aplica o recorte (período + contrato) a uma spec salva. O período entra na
 * dimensão de tempo do relatório; o contrato, como filtro, só onde existe.
 */
export function applyRecorte(
  spec: Omit<QuerySpec, "timeDimension"> & { timeDimension?: { dimension: string; granularity?: Granularity | null } },
  ds: CatalogDataset | undefined,
  recorte: Recorte,
  usesPeriod: boolean,
): QuerySpec {
  const filters: Filter[] = [...(spec.filters ?? [])];
  if (recorte.contractId && supportsContract(ds)) {
    filters.push({ dimension: "contract_id", operator: "equals", values: [recorte.contractId] });
  }
  const timeDim = spec.timeDimension?.dimension ?? ds?.defaultTimeDimension ?? null;
  const out: QuerySpec = { ...spec, filters, timeDimension: undefined };
  if (timeDim && (usesPeriod || spec.timeDimension?.granularity)) {
    out.timeDimension = {
      dimension: timeDim,
      ...(spec.timeDimension?.granularity ? { granularity: spec.timeDimension.granularity } : {}),
      ...(usesPeriod ? { range: recorte.range } : {}),
    };
  }
  if (!out.timeDimension) delete out.timeDimension;
  if (!out.filters?.length) delete out.filters;
  return out;
}
