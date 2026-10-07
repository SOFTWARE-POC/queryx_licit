import { FILTER_OPERATORS, GRANULARITIES, QuerySpec } from "./types";

const MAX_MEASURES = 20;
const MAX_DIMENSIONS = 8;
const MAX_FILTERS = 20;
const MAX_FILTER_VALUES = 200;
const MAX_STRING = 200;
const NAME = /^[a-z][a-z0-9_]{0,63}$/;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isName = (v: unknown): v is string => typeof v === "string" && NAME.test(v);

/**
 * Valida a FORMA da QuerySpec (a superfície de ataque). A validação semântica
 * (dataset/medida/dimensão existem?) fica no compilador, que conhece o catálogo.
 * Devolve uma QuerySpec NOVA só com os campos conhecidos — nada extra do corpo
 * da requisição segue adiante.
 */
export function validateQuerySpec(body: unknown): { errors: string[]; spec?: QuerySpec } {
  const errors: string[] = [];
  if (!isObject(body)) return { errors: ["O corpo da requisição precisa ser um objeto JSON."] };

  const allowed = new Set(["dataset", "measures", "dimensions", "timeDimension", "filters", "order", "limit", "timezone"]);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) errors.push(`Campo desconhecido: '${key}'.`);
  }

  if (!isName(body.dataset)) errors.push("'dataset' é obrigatório.");

  const measures = body.measures;
  if (!Array.isArray(measures) || measures.length === 0) {
    errors.push("'measures' precisa ter ao menos uma medida.");
  } else if (measures.length > MAX_MEASURES || !measures.every(isName)) {
    errors.push(`'measures' aceita até ${MAX_MEASURES} nomes de medida.`);
  } else if (new Set(measures).size !== measures.length) {
    errors.push("'measures' tem itens repetidos.");
  }

  const dimensions = body.dimensions;
  if (dimensions !== undefined) {
    if (!Array.isArray(dimensions) || dimensions.length > MAX_DIMENSIONS || !dimensions.every(isName)) {
      errors.push(`'dimensions' aceita até ${MAX_DIMENSIONS} nomes de dimensão.`);
    } else if (new Set(dimensions).size !== dimensions.length) {
      errors.push("'dimensions' tem itens repetidos.");
    }
  }

  const filters = body.filters;
  if (filters !== undefined) {
    if (!Array.isArray(filters) || filters.length > MAX_FILTERS) {
      errors.push(`'filters' aceita até ${MAX_FILTERS} filtros.`);
    } else {
      filters.forEach((f, i) => {
        if (!isObject(f)) {
          errors.push(`filters[${i}] precisa ser um objeto.`);
          return;
        }
        if (!isName(f.dimension)) errors.push(`filters[${i}].dimension é obrigatório.`);
        if (!FILTER_OPERATORS.includes(f.operator as never)) errors.push(`filters[${i}].operator inválido.`);
        if (f.values !== undefined) {
          const ok =
            Array.isArray(f.values) &&
            f.values.length <= MAX_FILTER_VALUES &&
            f.values.every(
              (v) =>
                (typeof v === "string" && v.length <= MAX_STRING) ||
                (typeof v === "number" && Number.isFinite(v)),
            );
          if (!ok) errors.push(`filters[${i}].values precisa ser uma lista de textos ou números.`);
        }
      });
    }
  }

  const td = body.timeDimension;
  if (td !== undefined) {
    if (!isObject(td) || !isName(td.dimension)) {
      errors.push("'timeDimension.dimension' é obrigatório.");
    } else {
      if (td.granularity != null && !GRANULARITIES.includes(td.granularity as never)) {
        errors.push(`'timeDimension.granularity' deve ser uma de: ${GRANULARITIES.join(", ")}.`);
      }
      if (td.range !== undefined) {
        const r = td.range;
        if (
          !Array.isArray(r) ||
          r.length !== 2 ||
          !r.every((v) => typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v)))
        ) {
          errors.push("'timeDimension.range' deve ser [início, fim] com datas ISO.");
        }
      }
    }
  }

  const order = body.order;
  if (order !== undefined) {
    const ok =
      Array.isArray(order) &&
      order.length <= MAX_DIMENSIONS + MAX_MEASURES &&
      order.every(
        (o) => Array.isArray(o) && o.length === 2 && typeof o[0] === "string" && (o[1] === "asc" || o[1] === "desc"),
      );
    if (!ok) errors.push("'order' deve ser uma lista de [coluna, 'asc' | 'desc'].");
  }

  if (body.limit !== undefined && (!Number.isInteger(body.limit) || (body.limit as number) <= 0)) {
    errors.push("'limit' deve ser um inteiro positivo.");
  }
  if (body.timezone !== undefined && (typeof body.timezone !== "string" || body.timezone.length > 64)) {
    errors.push("'timezone' inválido.");
  }

  if (errors.length) return { errors };

  const spec: QuerySpec = {
    dataset: body.dataset as string,
    measures: [...(measures as string[])],
    ...(dimensions ? { dimensions: [...(dimensions as string[])] } : {}),
    ...(td && isObject(td)
      ? {
          timeDimension: {
            dimension: td.dimension as string,
            ...(td.granularity != null ? { granularity: td.granularity as never } : {}),
            ...(td.range ? { range: [...(td.range as [string, string])] as [string, string] } : {}),
          },
        }
      : {}),
    ...(filters
      ? {
          filters: (filters as Array<Record<string, unknown>>).map((f) => ({
            dimension: f.dimension as string,
            operator: f.operator as never,
            ...(f.values ? { values: [...(f.values as Array<string | number>)] } : {}),
          })),
        }
      : {}),
    ...(order ? { order: (order as Array<[string, "asc" | "desc"]>).map(([k, d]) => [k, d] as [string, "asc" | "desc"]) } : {}),
    ...(body.limit !== undefined ? { limit: body.limit as number } : {}),
    ...(body.timezone !== undefined ? { timezone: body.timezone as string } : {}),
  };
  return { errors: [], spec };
}
