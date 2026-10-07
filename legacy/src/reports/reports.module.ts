import { Module } from "@nestjs/common";
import { AnalyticsModule } from "../analytics/analytics.module";
import { REPORT_REPOSITORY } from "./domain/report-repository.port";
import { MongoReportRepository } from "./infrastructure/mongo-report.repository";
import { ReportsService } from "./application/reports.use-cases";
import { ReportsController } from "./infrastructure/http/reports.controller";

@Module({
  imports: [AnalyticsModule],
  controllers: [ReportsController],
  providers: [ReportsService, { provide: REPORT_REPOSITORY, useClass: MongoReportRepository }],
})
export class ReportsModule {}
