import { Filter, Granularity, QuerySpec } from "../../analytics/domain/types";

export const REPORT_CATEGORIES = ["Pessoas", "Operação", "Contratos", "Conformidade"] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const VISUALIZATIONS = ["table", "bar", "line", "kpi"] as const;
export type Visualization = (typeof VISUALIZATIONS)[number];

/** QuerySpec salva num relatório: sem período nem fuso — vêm do recorte na hora de rodar. */
export type SavedSpec = Omit<QuerySpec, "timezone" | "timeDimension"> & {
  timeDimension?: { dimension: string; granularity?: Granularity | null };
};

export interface ReportDefinition {
  id: string;
  /** Definido em código (não editável) ou criado pela empresa. */
  system: boolean;
  code: string;
  name: string;
  category: ReportCategory;
  description: string;
  visualization: Visualization;
  spec: SavedSpec;
  /** Indicadores do topo do relatório (mesmo dataset, sem agrupamento). */
  kpis: { measures: string[]; filters?: Filter[] };
  /** Série temporal da aba de gráfico. */
  trend: { measure: string } | null;
  /** O relatório responde ao recorte de período (datasets com dimensão de tempo). */
  usesPeriod: boolean;
  createdBy?: { id: string; name: string };
  updatedAt?: string;
}
