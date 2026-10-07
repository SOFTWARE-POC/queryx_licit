import { Inject, Injectable } from "@nestjs/common";
import { AnalyticsService, TIMEZONE } from "../../analytics/application/analytics.service";
import { canUseDataset } from "../../analytics/domain/engine/compile";
import { QueryResult, QuerySpec, SecurityContext } from "../../analytics/domain/types";
import { ReportsService } from "../../reports/application/reports.service";
import { DashboardDefinition } from "../../reports/domain/dashboard";
import { ReportDefinition, withRange } from "../../reports/domain/report";
import { ExportTable, toCsv, toXlsx } from "./export";

const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
export const rangeLabel = (range: [string, string] | null) =>
  range ? (range[0] === range[1] ? `Dia ${dmy(range[0])}` : `${dmy(range[0])} a ${dmy(range[1])}`) : "Situação atual";

export interface ExportFile {
  filename: string;
  contentType: string;
  content: Buffer;
}

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const CSV_TYPE = "text/csv; charset=utf-8";

/** Monta tabelas de relatórios/painéis e os arquivos CSV/XLSX. */
@Injectable()
export class ExportService {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly reports: ReportsService,
    @Inject(TIMEZONE) private readonly timezone: string,
  ) {}

  tableOf(title: string, result: QueryResult, subtitle?: string): ExportTable {
    return {
      title,
      subtitle: subtitle ?? rangeLabel(result.meta.range),
      columns: result.columns,
      annotation: result.annotation,
      data: result.data,
    };
  }

  /** Relatório com o período (o padrão dele quando `range` é undefined; null = sem período). */
  async reportTable(report: ReportDefinition, range: [string, string] | null, ctx: SecurityContext, now?: Date) {
    const ds = this.analytics.dataset(report.spec.dataset);
    const spec = withRange(report.spec, report.defaultPeriod ? range : null, ds?.defaultTimeDimension);
    const result = await this.analytics.query(spec, ctx, now);
    return { table: this.tableOf(report.name, result), result };
  }

  /** Um painel: uma tabela por relatório (sem repetir), só os que a pessoa pode ver. */
  async dashboardTables(dashboard: DashboardDefinition, range: [string, string], ctx: SecurityContext, now?: Date) {
    const tables: ExportTable[] = [];
    const datasets = new Set<string>();
    const seen = new Set<string>();
    for (const w of dashboard.widgets) {
      if (seen.has(w.reportId)) continue;
      seen.add(w.reportId);
      const report = await this.reports.findReport(ctx.tenantId, w.reportId);
      const ds = report && this.analytics.dataset(report.spec.dataset);
      if (!report || !ds || !canUseDataset(ds, ctx)) continue;
      datasets.add(ds.name);
      tables.push((await this.reportTable(report, range, ctx, now)).table);
    }
    return { tables, datasets: [...datasets] };
  }

  async file(tables: ExportTable[], format: "XLSX" | "CSV", baseName: string): Promise<ExportFile> {
    if (format === "CSV") {
      // CSV é uma tabela só: o painel exporta a primeira (o XLSX leva todas).
      return { filename: `${baseName}.csv`, contentType: CSV_TYPE, content: toCsv(tables[0], this.timezone) };
    }
    return { filename: `${baseName}.xlsx`, contentType: XLSX_TYPE, content: await toXlsx(tables, this.timezone) };
  }

  async adhoc(spec: QuerySpec, title: string, ctx: SecurityContext) {
    const result = await this.analytics.query(spec, ctx);
    return this.tableOf(title, result);
  }
}
