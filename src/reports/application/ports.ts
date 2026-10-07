import { Author, ReportDefinition, ReportInput } from "../domain/report";
import { DashboardDefinition, DashboardInput } from "../domain/dashboard";

export interface ReportRepository {
  list(companyId: string): Promise<ReportDefinition[]>;
  get(companyId: string, id: string): Promise<ReportDefinition | null>;
  create(companyId: string, input: ReportInput, category: string, author: Author): Promise<ReportDefinition>;
  update(companyId: string, id: string, input: ReportInput, category: string, author: Author): Promise<ReportDefinition | null>;
  delete(companyId: string, id: string): Promise<boolean>;
}
export const REPORT_REPOSITORY = Symbol("REPORT_REPOSITORY");

export interface DashboardRepository {
  list(companyId: string): Promise<DashboardDefinition[]>;
  get(companyId: string, id: string): Promise<DashboardDefinition | null>;
  create(companyId: string, input: DashboardInput, author: Author): Promise<DashboardDefinition>;
  update(companyId: string, id: string, input: DashboardInput, author: Author): Promise<DashboardDefinition | null>;
  delete(companyId: string, id: string): Promise<boolean>;
}
export const DASHBOARD_REPOSITORY = Symbol("DASHBOARD_REPOSITORY");

/** Nome do schema do serviço (validado), para os adapters montarem o SQL. */
export const DB_SCHEMA = Symbol("DB_SCHEMA");
