/**
 * Tipos da camada semântica e do engine de consulta.
 *
 * O cliente descreve O QUE quer (QuerySpec) usando apelidos (dataset, measures,
 * dimensions). O catálogo (Dataset) diz o que cada apelido significa. O compilador
 * transforma isso num aggregation pipeline do Mongo, injetando o tenant, que NUNCA
 * vem do cliente.
 *
 * Domínio puro: nada de Nest, Express ou driver do Mongo aqui.
 */

/** Expressão de aggregation do Mongo (objeto genérico). */
export type MongoExpr = Record<string, unknown>;

/** Estágio de pipeline do Mongo. */
export type PipelineStage = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Catálogo: dimensões e medidas
// ---------------------------------------------------------------------------

export type DimensionType = "string" | "number" | "time" | "id";

/** Formatos que o frontend sabe renderizar. */
export type ValueFormat =
  | "integer"
  | "number"
  | "percent"
  | "currency"
  | "hours"
  | "date"
  | "datetime"
  | "time";

export interface Lookup {
  from: string;
  localField: string;
  foreignField: string;
  /** Nome do campo temporário do join. Use prefixo `__` pra não sobrescrever
   * o campo original (que outra dimensão pode usar como id). */
  as: string;
  /** Campos trazidos do documento relacionado — só eles entram no pipeline.
   * Evita carregar dados sensíveis (ex.: hash de senha de `users`). */
  fields: string[];
  /**
   * O atributo é 1:1 com a chave local (ex.: nome do usuário pelo id). O grupo é
   * feito pela CHAVE e o join roda depois do `$group`, uma vez por grupo — em vez
   * de uma vez por documento. De quebra, dois usuários homônimos não se fundem.
   * Não use para atributos N:1 (ex.: órgão da licitação), senão o agrupamento
   * deixa de juntar registros com o mesmo valor.
   */
  late?: boolean;
}

export interface Dimension {
  title: string;
  type: DimensionType;
  /** Caminho do campo APÓS eventuais lookups, sem o `$`. */
  expr: string;
  /** Join necessário pra dimensão. Dimensões com join não podem ser filtradas
   * (mantém o `$match` indexável). */
  lookup?: Lookup;
  format?: ValueFormat;
  /** Dado pessoal (nome de pessoa). O frontend pode mascarar (LGPD). */
  pii?: boolean;
  /** Rótulos legíveis dos valores de um enum (ex.: CONCLUIDA → Concluída). */
  labels?: Record<string, string>;
}

interface MeasureBase {
  title: string;
  format?: ValueFormat;
  /** Tipo do valor de saída. Padrão: number. `time` para min/max de datas. */
  valueType?: "number" | "time";
  description?: string;
}

export type Measure =
  | (MeasureBase & { kind: "count"; filter?: MongoExpr })
  | (MeasureBase & {
      kind: "countDistinct";
      field?: string;
      expr?: MongoExpr;
      filter?: MongoExpr;
    })
  | (MeasureBase & {
      kind: "sum" | "avg" | "min" | "max";
      field?: string;
      expr?: MongoExpr;
      filter?: MongoExpr;
    })
  | (MeasureBase & {
      /** Medida derivada: SUM(num)/SUM(den), resolvida no $project. */
      kind: "ratio";
      numerator: string;
      denominator: string;
    });

export interface SourceOptions {
  timezone: string;
}

export interface Dataset {
  /** Nome público (usado na QuerySpec). */
  name: string;
  title: string;
  description: string;
  /** Collection física consultada. */
  collection: string;
  /** O que uma linha representa. */
  grain: string;
  /** Campo de company usado para isolamento multi-tenant. */
  tenantField: string;
  /** Predicado fixo do dataset, somado ao tenant no primeiro `$match`. */
  baseMatch?: Record<string, unknown>;
  /**
   * Estágios que derivam o grão do dataset a partir da collection (ex.: parear
   * entradas e saídas de ponto em jornadas). Rodam DEPOIS do `$match` de tenant.
   * Filtros e período do usuário passam a ser aplicados sobre os campos
   * derivados, num segundo `$match`.
   */
  source?: (options: SourceOptions) => PipelineStage[];
  /**
   * Com `source`, o período do usuário só é aplicado depois da derivação. Para
   * não varrer o histórico inteiro, o primeiro `$match` recorta o campo bruto
   * com uma folga (`padDays`) pros dois lados.
   */
  prefilter?: { field: string; padDays: number };
  defaultTimeDimension?: string;
  dimensions: Record<string, Dimension>;
  measures: Record<string, Measure>;
}

// ---------------------------------------------------------------------------
// QuerySpec: o contrato público da API
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
  values?: Array<string | number>;
}

export const GRANULARITIES = ["day", "week", "month", "quarter", "year"] as const;
export type Granularity = (typeof GRANULARITIES)[number];

export interface TimeDimensionSpec {
  dimension: string;
  granularity?: Granularity | null;
  /** [início, fim]. Datas `YYYY-MM-DD` são dias no fuso da consulta, com o fim
   * inclusivo. Datas-hora ISO são instantes, com o fim exclusivo. */
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
  /** Fuso para truncar datas e interpretar o período. */
  timezone?: string;
}

// ---------------------------------------------------------------------------
// Segurança e saída
// ---------------------------------------------------------------------------

/** Derivado EXCLUSIVAMENTE da sessão autenticada. Nunca do corpo da requisição. */
export interface SecurityContext {
  tenantId: string;
  userId: string;
}

export interface ColumnAnnotation {
  title: string;
  type: "string" | "number" | "time";
  format: ValueFormat | null;
  pii?: boolean;
  labels?: Record<string, string>;
}

export interface CompiledQuery {
  collection: string;
  pipeline: PipelineStage[];
  annotation: Record<string, ColumnAnnotation>;
  /** Colunas na ordem: dimensões, bucket de tempo, medidas. */
  columns: string[];
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
    pipeline?: PipelineStage[];
  };
}

/** Erro de validação/compilação com detalhe amigável. */
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
