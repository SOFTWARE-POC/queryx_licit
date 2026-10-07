import { Inject, Injectable } from "@nestjs/common";
import { APP_CONFIG, AppConfig } from "../../config/app-config";
import { compile, DatasetLookup, DEFAULT_LIMIT, MAX_LIMIT } from "../domain/engine/compile";
import { QueryResult, QuerySpec, SecurityContext } from "../domain/types";
import { CATALOG, QUERY_EXECUTOR, QueryExecutorPort } from "./query-executor.port";

@Injectable()
export class RunQueryUseCase {
  constructor(
    @Inject(CATALOG) private readonly catalog: DatasetLookup,
    @Inject(QUERY_EXECUTOR) private readonly executor: QueryExecutorPort,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async execute(spec: QuerySpec, ctx: SecurityContext): Promise<QueryResult> {
    const started = Date.now();
    const compiled = compile(spec, ctx, this.catalog, { defaultTimezone: this.config.timezone });
    const data = await this.executor.aggregate(compiled.collection, compiled.pipeline, {
      timeoutMs: this.config.queryTimeoutMs,
    });
    const limit = Math.min(spec.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    return {
      data,
      annotation: compiled.annotation,
      columns: compiled.columns,
      meta: {
        durationMs: Date.now() - started,
        rowCount: data.length,
        truncated: data.length >= limit,
        // Pipeline só fora de produção — ajuda a depurar sem expor a estrutura do banco.
        ...(this.config.production ? {} : { pipeline: compiled.pipeline }),
      },
    };
  }
}
