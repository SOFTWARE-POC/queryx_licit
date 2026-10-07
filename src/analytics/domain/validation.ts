import { isCalendarDate } from "./period";
import { Filter, FILTER_OPERATORS, GRANULARITIES, QuerySpec } from "./types";

const MAX_MEASURES = 20;
const MAX_DIMENSIONS = 8;
const MAX_FILTERS = 20;
const MAX_FILTER_VALUES = 200;
const MAX_STRING = 200;
const NAME = /^[a-z][a-z0-9_]{0,63}$/;

export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const isName = (v: unknown): v is string => typeof v === "string" && NAME.test(v);

function unknownKeys(body: Record<string, unknown>, allowed: string[], where: string, errors: string[]) {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) errors.push(`${where}: campo desconhecido '${key}'.`);
  }
}

function validateFilters(raw: unknown, errors: string[]): Filter[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length > MAX_FILTERS) {
    errors.push(`'filters' aceita até ${MAX_FILTERS} filtros.`);
    return undefined;
  }
  const out: Filter[] = [];
  raw.forEach((f, i) => {
    if (!isObject(f)) {
      errors.push(`filters[${i}] precisa ser um objeto.`);
      return;
    }
    unknownKeys(f, ["dimension", "operator", "values"], `filters[${i}]`, errors);
    if (!isName(f.dimension)) errors.push(`filters[${i}].dimension é obrigatório.`);
    if (!FILTER_OPERATORS.includes(f.operator as never)) errors.push(`filters[${i}].operator inválido.`);
    const values = f.values;
    if (values !== undefined) {
      const ok =
        Array.isArray(values) &&
        values.length <= MAX_FILTER_VALUES &&
        values.every(
          (v) =>
            (typeof v === "string" && v.length <= MAX_STRING) ||
            (typeof v === "number" && Number.isFinite(v)) ||
            typeof v === "boolean",
        );
      if (!ok) errors.push(`filters[${i}].values precisa ser uma lista de textos, números ou sim/não.`);
    }
    out.push({
      dimension: f.dimension as string,
      operator: f.operator as Filter["operator"],
      ...(Array.isArray(values) ? { values: [...(values as Array<string | number | boolean>)] } : {}),
    });
  });
  return out;
}

function validateRange(raw: unknown, where: string, errors: string[]): [string, string] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length !== 2 || !raw.every(isCalendarDate)) {
    errors.push(`'${where}' deve ser [início, fim] com datas AAAA-MM-DD.`);
    return undefined;
  }
  return [raw[0], raw[1]];
}

/**
 * Valida a FORMA da QuerySpec (a superfície de ataque). Se dataset, medidas e
 * dimensões existem é o compilador que confere, porque ele conhece o catálogo.
 * Devolve uma QuerySpec NOVA só com os campos conhecidos.
 */
export function validateQuerySpec(body: unknown): { errors: string[]; spec?: QuerySpec } {
  const errors: string[] = [];
  if (!isObject(body)) return { errors: ["A consulta precisa ser um objeto JSON."] };
  unknownKeys(body, ["dataset", "measures", "dimensions", "timeDimension", "filters", "order", "limit"], "consulta", errors);

  if (!isName(body.dataset)) errors.push("'dataset' é obrigatório.");

  const measures = body.measures;
  if (!Array.isArray(measures) || measures.length === 0) {
    errors.push("Escolha ao menos uma medida.");
  } else if (measures.length > MAX_MEASURES || !measures.every(isName)) {
    errors.push(`'measures' aceita até ${MAX_MEASURES} medidas.`);
  } else if (new Set(measures).size !== measures.length) {
    errors.push("'measures' tem itens repetidos.");
  }

  const dimensions = body.dimensions;
  if (dimensions !== undefined) {
    if (!Array.isArray(dimensions) || dimensions.length > MAX_DIMENSIONS || !dimensions.every(isName)) {
      errors.push(`Separe por no máximo ${MAX_DIMENSIONS} campos.`);
    } else if (new Set(dimensions).size !== dimensions.length) {
      errors.push("'dimensions' tem itens repetidos.");
    }
  }

  const filters = validateFilters(body.filters, errors);

  const td = body.timeDimension;
  let timeDimension: QuerySpec["timeDimension"];
  if (td !== undefined) {
    if (!isObject(td) || !isName(td.dimension)) {
      errors.push("'timeDimension.dimension' é obrigatório.");
    } else {
      unknownKeys(td, ["dimension", "granularity", "range"], "timeDimension", errors);
      if (td.granularity != null && !GRANULARITIES.includes(td.granularity as never)) {
        errors.push(`'timeDimension.granularity' deve ser: ${GRANULARITIES.join(", ")}.`);
      }
      const range = validateRange(td.range, "timeDimension.range", errors);
      timeDimension = {
        dimension: td.dimension,
        ...(td.granularity != null ? { granularity: td.granularity as never } : {}),
        ...(range ? { range } : {}),
      };
    }
  }

  const order = body.order;
  if (order !== undefined) {
    const ok =
      Array.isArray(order) &&
      order.length <= MAX_DIMENSIONS + MAX_MEASURES + 1 &&
      order.every(
        (o) =>
          Array.isArray(o) &&
          o.length === 2 &&
          typeof o[0] === "string" &&
          o[0].length <= 140 &&
          (o[1] === "asc" || o[1] === "desc"),
      );
    if (!ok) errors.push("'order' deve ser uma lista de [coluna, 'asc' | 'desc'].");
  }

  if (body.limit !== undefined && (!Number.isInteger(body.limit) || (body.limit as number) <= 0)) {
    errors.push("'limit' deve ser um inteiro positivo.");
  }

  if (errors.length) return { errors };
  return {
    errors: [],
    spec: {
      dataset: body.dataset as string,
      measures: [...(measures as string[])],
      ...(dimensions ? { dimensions: [...(dimensions as string[])] } : {}),
      ...(timeDimension ? { timeDimension } : {}),
      ...(filters ? { filters } : {}),
      ...(order ? { order: (order as Array<[string, "asc" | "desc"]>).map(([k, d]) => [k, d] as [string, "asc" | "desc"]) } : {}),
      ...(body.limit !== undefined ? { limit: body.limit as number } : {}),
    },
  };
}

/** Pedido de detalhamento: tema, período e filtros (inclui o valor clicado). */
export function validateRecordsSpec(body: unknown) {
  const errors: string[] = [];
  if (!isObject(body)) return { errors: ["O pedido precisa ser um objeto JSON."] };
  unknownKeys(body, ["dataset", "timeDimension", "filters"], "detalhamento", errors);
  if (!isName(body.dataset)) errors.push("'dataset' é obrigatório.");
  const filters = validateFilters(body.filters, errors);
  let timeDimension: { dimension: string; range?: [string, string] } | undefined;
  const td = body.timeDimension;
  if (td !== undefined) {
    if (!isObject(td) || !isName(td.dimension)) errors.push("'timeDimension.dimension' é obrigatório.");
    else {
      const range = validateRange(td.range, "timeDimension.range", errors);
      timeDimension = { dimension: td.dimension, ...(range ? { range } : {}) };
    }
  }
  if (errors.length) return { errors };
  return {
    errors: [],
    spec: {
      dataset: body.dataset as string,
      ...(timeDimension ? { timeDimension } : {}),
      ...(filters ? { filters } : {}),
    },
  };
}
