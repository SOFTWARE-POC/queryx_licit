import { Module } from "@nestjs/common";
import { APP_CONFIG, AppConfig } from "../config/app-config";
import { buildCatalog } from "./domain/semantic/registry";
import { CATALOG, QUERY_EXECUTOR } from "./application/query-executor.port";
import { RunQueryUseCase } from "./application/run-query.use-case";
import { GetCatalogUseCase } from "./application/get-catalog.use-case";
import { MongoQueryExecutorAdapter } from "./infrastructure/mongo-query-executor.adapter";
import { AnalyticsController } from "./infrastructure/http/analytics.controller";

@Module({
  controllers: [AnalyticsController],
  providers: [
    {
      provide: CATALOG,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => buildCatalog({ standardWorkdayMinutes: config.standardWorkdayMinutes }),
    },
    { provide: QUERY_EXECUTOR, useClass: MongoQueryExecutorAdapter },
    RunQueryUseCase,
    GetCatalogUseCase,
  ],
  exports: [CATALOG, RunQueryUseCase],
})
export class AnalyticsModule {}
