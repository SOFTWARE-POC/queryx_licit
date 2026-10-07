import { ReportDefinition } from "./report-definition";

export type NewReport = Omit<ReportDefinition, "id" | "system" | "updatedAt">;

/** Port: relatórios personalizados, sempre escopados por empresa. */
export interface ReportRepositoryPort {
  listByCompany(companyId: string): Promise<ReportDefinition[]>;
  findInCompany(companyId: string, id: string): Promise<ReportDefinition | null>;
  create(companyId: string, report: NewReport): Promise<ReportDefinition>;
  update(companyId: string, id: string, report: NewReport): Promise<ReportDefinition | null>;
  delete(companyId: string, id: string): Promise<boolean>;
}

export const REPORT_REPOSITORY = Symbol("REPORT_REPOSITORY");
