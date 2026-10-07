export type ValueFormat =
  | "integer" | "number" | "percent" | "currency" | "hours" | "date" | "datetime" | "time";

export interface Session {
  timezone: string;
  name: string;
  email: string;
  company: { id: string; name: string };
  role: string;
  canManage: boolean;
}

export interface Column {
  title: string;
  type: "string" | "number" | "time";
  format: ValueFormat | null;
  pii?: boolean;
  labels?: Record<string, string>;
}

export interface QueryResult {
  data: Array<Record<string, unknown>>;
  annotation: Record<string, Column>;
  columns: string[];
  meta: { durationMs: number; rowCount: number; truncated: boolean };
}

export type Granularity = "day" | "week" | "month" | "quarter" | "year";

export interface Filter {
  dimension: string;
  operator: string;
  values?: Array<string | number>;
}

export interface QuerySpec {
  dataset: string;
  measures: string[];
  dimensions?: string[];
  timeDimension?: { dimension: string; granularity?: Granularity | null; range?: [string, string] };
  filters?: Filter[];
  order?: Array<[string, "asc" | "desc"]>;
  limit?: number;
}

export interface CatalogDimension {
  name: string;
  title: string;
  type: "string" | "number" | "time" | "id";
  format: ValueFormat | null;
  filterable: boolean;
  pii: boolean;
  labels: Record<string, string> | null;
}

export interface CatalogMeasure {
  name: string;
  title: string;
  kind: string;
  format: ValueFormat;
  description: string | null;
}

export interface CatalogDataset {
  name: string;
  title: string;
  description: string;
  grain: string;
  defaultTimeDimension: string | null;
  dimensions: CatalogDimension[];
  measures: CatalogMeasure[];
}

export type Category = "Pessoas" | "Operação" | "Contratos" | "Conformidade";
export const CATEGORIES: Category[] = ["Pessoas", "Operação", "Contratos", "Conformidade"];

export type Visualization = "table" | "bar" | "line" | "kpi";

export interface ReportDefinition {
  id: string;
  system: boolean;
  code: string;
  name: string;
  category: Category;
  description: string;
  visualization: Visualization;
  spec: Omit<QuerySpec, "timeDimension"> & { timeDimension?: { dimension: string; granularity?: Granularity | null } };
  kpis: { measures: string[]; filters?: Filter[] };
  trend: { measure: string } | null;
  usesPeriod: boolean;
  createdBy?: { id: string; name: string };
  updatedAt?: string;
}
