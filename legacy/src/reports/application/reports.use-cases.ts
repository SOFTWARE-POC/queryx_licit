import { Inject, Injectable } from "@nestjs/common";
import { AppError } from "../../common/errors";
import { DatasetLookup } from "../../analytics/domain/engine/compile";
import { CATALOG } from "../../analytics/application/query-executor.port";
import { Principal } from "../../auth/domain/principal";
import { ReportDefinition } from "../domain/report-definition";
import { REPORT_REPOSITORY, ReportRepositoryPort } from "../domain/report-repository.port";
import { SYSTEM_REPORTS } from "../domain/system-reports";
import { validateReportInput } from "./validate-report-input";

const notFound = () => new AppError("not-found", "Relatório não encontrado.");
const systemReadOnly = () =>
  new AppError("conflict", "Relatórios do sistema não podem ser alterados. Crie uma cópia no construtor.");

@Injectable()
export class ReportsService {
  constructor(
    @Inject(REPORT_REPOSITORY) private readonly repo: ReportRepositoryPort,
    @Inject(CATALOG) private readonly catalog: DatasetLookup,
  ) {}

  async list(principal: Principal): Promise<ReportDefinition[]> {
    const custom = await this.repo.listByCompany(principal.companyId);
    return [...SYSTEM_REPORTS, ...custom];
  }

  async get(principal: Principal, id: string): Promise<ReportDefinition> {
    const system = SYSTEM_REPORTS.find((r) => r.id === id);
    if (system) return system;
    const report = await this.repo.findInCompany(principal.companyId, id);
    if (!report) throw notFound();
    return report;
  }

  create(principal: Principal, body: unknown): Promise<ReportDefinition> {
    const input = validateReportInput(body, this.catalog, { id: principal.userId, name: principal.name });
    return this.repo.create(principal.companyId, input);
  }

  async update(principal: Principal, id: string, body: unknown): Promise<ReportDefinition> {
    if (SYSTEM_REPORTS.some((r) => r.id === id)) throw systemReadOnly();
    const input = validateReportInput(body, this.catalog, { id: principal.userId, name: principal.name });
    const updated = await this.repo.update(principal.companyId, id, input);
    if (!updated) throw notFound();
    return updated;
  }

  async remove(principal: Principal, id: string): Promise<void> {
    if (SYSTEM_REPORTS.some((r) => r.id === id)) throw systemReadOnly();
    if (!(await this.repo.delete(principal.companyId, id))) throw notFound();
  }
}
