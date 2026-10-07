import { isPeriodPreset, PeriodPreset } from "../../analytics/domain/period";
import { Filter, Granularity, QuerySpec } from "../../analytics/domain/types";
import { isObject, validateQuerySpec } from "../../analytics/domain/validation";

export const VISUALIZATIONS = ["table", "bar", "hbar", "line", "area", "pie", "kpi"] as const;
export type Visualization = (typeof VISUALIZATIONS)[number];

/** Consulta salva: sem período (vem do recorte na hora de rodar). */
export interface SavedSpec {
  dataset: string;
  measures: string[];
  dimensions?: string[];
  timeDimension?: { dimension: string; granularity?: Granularity | null };
  filters?: Filter[];
  order?: Array<[string, "asc" | "desc"]>;
  limit?: number;
}

export interface Author {
  id: string;
  name: string;
}

export interface ReportDefinition {
  id: string;
  /** Pronto (definido em código, não editável) ou criado pela empresa. */
  system: boolean;
  name: string;
  description: string;
  /** Categoria do tema (Operação, Pessoas...). */
  category: string;
  visualization: Visualization;
  spec: SavedSpec;
  /** Período padrão ao abrir; null = o relatório não usa período (ex.: status agora). */
  defaultPeriod: PeriodPreset | null;
  createdBy?: Author | null;
  updatedBy?: Author | null;
  updatedAt?: string;
}

export interface ReportInput {
  name: string;
  description: string;
  visualization: Visualization;
  spec: SavedSpec;
  defaultPeriod: PeriodPreset | null;
}

/**
 * Consulta pronta para rodar: a salva + o período escolhido. Sem campo de data
 * na consulta, o período vale para o campo padrão do tema.
 */
export function withRange(spec: SavedSpec, range: [string, string] | null, defaultTimeDimension?: string): QuerySpec {
  const { timeDimension: time, ...rest } = spec;
  const dimension = time?.dimension ?? defaultTimeDimension;
  if (!dimension || (!range && !time)) return rest;
  return {
    ...rest,
    timeDimension: {
      dimension,
      ...(time?.granularity ? { granularity: time.granularity } : {}),
      ...(range ? { range } : {}),
    },
  };
}

/**
 * Valida o corpo de criação/edição de relatório. A consulta passa pela mesma
 * validação de forma da API de consulta; nomes de tema/campo são conferidos
 * depois, contra o catálogo, compilando a consulta.
 */
export function validateReportInput(body: unknown): { errors: string[]; input?: ReportInput } {
  const errors: string[] = [];
  if (!isObject(body)) return { errors: ["O relatório precisa ser um objeto JSON."] };
  for (const key of Object.keys(body)) {
    if (!["name", "description", "visualization", "spec", "defaultPeriod"].includes(key)) {
      errors.push(`Campo desconhecido: '${key}'.`);
    }
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 2 || name.length > 120) errors.push("O nome precisa ter de 2 a 120 caracteres.");
  const description = body.description === undefined ? "" : typeof body.description === "string" ? body.description.trim() : null;
  if (description === null || description.length > 500) errors.push("A descrição aceita até 500 caracteres.");
  if (!VISUALIZATIONS.includes(body.visualization as never)) {
    errors.push(`'visualization' deve ser: ${VISUALIZATIONS.join(", ")}.`);
  }
  const period = body.defaultPeriod ?? null;
  if (period !== null && !isPeriodPreset(period)) errors.push("Período padrão inválido.");

  let spec: SavedSpec | undefined;
  if (!isObject(body.spec)) errors.push("'spec' é obrigatório.");
  else {
    const td = body.spec.timeDimension;
    if (isObject(td) && td.range !== undefined) errors.push("O relatório salvo não guarda período (use 'defaultPeriod').");
    const v = validateQuerySpec(body.spec);
    errors.push(...v.errors);
    if (v.spec) {
      const { timeDimension, ...rest } = v.spec;
      spec = {
        ...rest,
        ...(timeDimension
          ? { timeDimension: { dimension: timeDimension.dimension, granularity: timeDimension.granularity ?? null } }
          : {}),
      };
    }
  }
  if (errors.length || !spec) return { errors };
  return {
    errors: [],
    input: {
      name,
      description: description ?? "",
      visualization: body.visualization as Visualization,
      spec,
      defaultPeriod: period as PeriodPreset | null,
    },
  };
}
