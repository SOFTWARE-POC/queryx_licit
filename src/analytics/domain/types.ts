/**
 * Tipos da camada semântica e do compilador de consultas.
 *
 * O cliente descreve O QUE quer (QuerySpec) usando apelidos (dataset, medidas,
 * dimensões). O catálogo (Dataset) diz o que cada apelido significa em SQL. O
 * compilador junta as duas coisas num SELECT parametrizado, sempre com a
 * empresa da sessão, que NUNCA vem do cliente.
 *
 * Domínio puro: nada de Nest, Express ou driver do Postgres aqui.
 */

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

/** `time` = instante (timestamptz); `date` = dia sem hora (date). */
export type DimensionType = "string" | "number" | "boolean" | "time" | "date";

/** Formatos que o front sabe mostrar. */
export type ValueFormat =
  | "integer"
  | "number"
  | "decimal"
  | "percent"
  | "currency"
  | "hours"
  | "minutes"
  | "days"
  | "meters"
  | "date"
  | "datetime"
  | "time";

export interface Dimension {
  title: string;
  type: DimensionType;
  /** Expressão SQL do valor mostrado (confiável: vem do catálogo, nunca do cliente). */
  sql: string;
  /**
   * Chave estável para agrupar e filtrar (ex.: id da pessoa). Sem ela, duas
   * pessoas com o mesmo nome virariam uma linha só. O resultado traz a chave em
   * `<dimensão>__key` (usada pelo detalhamento).
   */
  key?: string;
  /** Joins nomeados do dataset de que a expressão precisa. */
  joins?: string[];
  description?: string;
  format?: ValueFormat;
  /** Nome de pessoa (LGPD): o front pode mascarar. */
  pii?: boolean;
  /** Rótulos legíveis dos valores de um enum (CONCLUIDA → Concluída). */
  labels?: Record<string, string>;
  /** Pode virar "separar por". Padrão: true (datas-hora exatas costumam ser false). */
  groupable?: boolean;
}

interface MeasureBase {
  title: string;
  format?: ValueFormat;
  description?: string;
  joins?: string[];
}

export type Measure =
  | (MeasureBase & { kind: "count"; filter?: string })
  | (MeasureBase & { kind: "countDistinct" | "sum" | "avg" | "min" | "max"; sql: string; filter?: string })
  | (MeasureBase & {
      /** Medida derivada: SUM(num)/SUM(den), calculada depois do agrupamento. */
      kind: "ratio";
      numerator: string;
      denominator: string;
    });

/** Placeholders que o compilador entrega à origem de um dataset derivado. */
export interface SourceParams {
  /** Empresa da sessão (uuid). */
  tenant: string;
  /** Fuso (texto). */
  tz: string;
  /** Período pedido, como `date` local (início e fim inclusivos), se houver. */
  start: string | null;
  end: string | null;
}

export type DatasetCategory = "Operação" | "Pessoas" | "Conformidade" | "Contratos";

export interface Dataset {
  /** Nome público (usado na QuerySpec). */
  name: string;
  title: string;
  description: string;
  category: DatasetCategory;
  /** O que uma linha representa (aparece no construtor). */
  grain: string;
  /** Ícone sugerido para o front (nome do lucide). */
  icon: string;
  /** Permissões da API principal exigidas, além de `report:read`. */
  requires: string[];
  /**
   * Origem com alias `t`: uma tabela (`public.service_orders t`) ou um
   * subselect derivado. Precisa expor `t.company_id`.
   */
  source: string | ((p: SourceParams) => string);
  /** Joins nomeados, incluídos só quando alguma dimensão ou medida pede. */
  joins?: Record<string, { sql: string; requires?: string[] }>;
  /** Predicado fixo do dataset (SQL confiável). */
  where?: string;
  defaultTimeDimension?: string;
  /** O dataset precisa de período (ex.: dias de escala gerados). Sem ele, últimos 30 dias. */
  needsPeriod?: boolean;
  dimensions: Record<string, Dimension>;
  measures: Record<string, Measure>;
  /** Detalhamento: colunas (dimensões) da lista de registros e a ordem. */
  records: {
    columns: string[];
    order: string;
    /** Link do registro no painel (ex.: OS → /admin/ordem-servicos/:id). */
    link?: { sql: string; kind: "service-order" | "user" | "contract" | "licit" };
  };
}

// ---------------------------------------------------------------------------
// QuerySpec: o contrato público
// ---------------------------------------------------------------------------

export const FILTER_OPERATORS = [
  "equals",
  "notEquals",
  "contains",
  "notContains",
  "gt",
  "gte",
  "lt",
  "lte",
  "set",
  "notSet",
  "inDateRange",
] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

export interface Filter {
  dimension: string;
  operator: FilterOperator;
  values?: Array<string | number | boolean>;
}

export const GRANULARITIES = ["day", "week", "month", "quarter", "year"] as const;
export type Granularity = (typeof GRANULARITIES)[number];

export interface TimeDimensionSpec {
  dimension: string;
  granularity?: Granularity | null;
  /** [início, fim] em `YYYY-MM-DD`, dias locais do fuso, fim inclusivo. */
  range?: [string, string];
}

export interface QuerySpec {
  dataset: string;
  measures: string[];
  dimensions?: string[];
  timeDimension?: TimeDimensionSpec;
  filters?: Filter[];
  order?: Array<[string, "asc" | "desc"]>;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Segurança e saída
// ---------------------------------------------------------------------------

/** Derivado EXCLUSIVAMENTE da sessão autenticada (ou do agendamento salvo). */
export interface SecurityContext {
  tenantId: string;
  userId: string;
  permissions: readonly string[];
}

export interface ColumnAnnotation {
  title: string;
  type: "string" | "number" | "boolean" | "time" | "date";
  format: ValueFormat | null;
  /** dimension | time (bucket) | measure */
  role: "dimension" | "bucket" | "measure";
  pii?: boolean;
  labels?: Record<string, string>;
  /** Bucket de tempo: granularidade (o valor vem como `YYYY-MM-DD` do início). */
  granularity?: Granularity;
  /** Dimensão com chave: o resultado traz `<coluna>__key`. */
  hasKey?: boolean;
}

export interface CompiledSql {
  text: string;
  params: unknown[];
}

export interface CompiledQuery extends CompiledSql {
  annotation: Record<string, ColumnAnnotation>;
  /** Colunas na ordem: dimensões, bucket de tempo, medidas. */
  columns: string[];
  limit: number;
  /** Período aplicado (o pedido ou o padrão do dataset). */
  range: [string, string] | null;
}

export interface QueryResult {
  data: Array<Record<string, unknown>>;
  annotation: Record<string, ColumnAnnotation>;
  columns: string[];
  meta: {
    durationMs: number;
    rowCount: number;
    /** Resultado cortado pelo limite. */
    truncated: boolean;
    /** Período efetivamente aplicado (datasets que exigem período ganham um padrão). */
    range: [string, string] | null;
  };
}

/** Erro de validação/compilação com mensagem amigável. */
export class QueryError extends Error {
  constructor(
    public readonly kind: string,
    message: string,
    public readonly available?: string[],
  ) {
    super(message);
    this.name = "QueryError";
  }
}
