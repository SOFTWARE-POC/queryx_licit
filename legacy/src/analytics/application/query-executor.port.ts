import { PipelineStage } from "../domain/types";

/** Port: roda um pipeline numa collection. Implementado pelo driver do Mongo. */
export interface QueryExecutorPort {
  aggregate(
    collection: string,
    pipeline: PipelineStage[],
    options: { timeoutMs: number },
  ): Promise<Array<Record<string, unknown>>>;
}

export const QUERY_EXECUTOR = Symbol("QUERY_EXECUTOR");
export const CATALOG = Symbol("CATALOG");
