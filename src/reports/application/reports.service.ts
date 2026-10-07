import { Inject, Injectable } from "@nestjs/common";
import { AnalyticsService } from "../../analytics/application/analytics.service";
import { canUseDataset } from "../../analytics/domain/engine/compile";
import { SecurityContext } from "../../analytics/domain/types";
import { AppError } from "../../common/errors";
import { DashboardDefinition, validateDashboardInput } from "../domain/dashboard";
import { Author, ReportDefinition, validateReportInput, withRange } from "../domain/report";
import { SYSTEM_DASHBOARDS, SYSTEM_REPORTS } from "../domain/system-reports";
import { DASHBOARD_REPOSITORY, DashboardRepository, REPORT_REPOSITORY, ReportRepository } from "./ports";

/** Quem age: empresa e permissões (do token) e nome para a autoria. */
export interface Actor extends SecurityContext {
  name: string;
}

const author = (a: Actor): Author => ({ id: a.userId, name: a.name });

/** O que os relatórios/painéis apagados ou alterados precisam avisar (agendamentos). */
export interface TargetCleanup {
  targetRemoved(companyId: string, type: "report" | "dashboard", id: string): Promise<void>;
}
export const TARGET_CLEANUP = Symbol("TARGET_CLEANUP");

@Injectable()
export class ReportsService {
  constructor(
    @Inject(REPORT_REPOSITORY) private readonly reports: ReportRepository,
    @Inject(DASHBOARD_REPOSITORY) private readonly dashboards: DashboardRepository,
    private readonly analytics: AnalyticsService,
    @Inject(TARGET_CLEANUP) private readonly cleanup: TargetCleanup,
  ) {}

  private readable(r: ReportDefinition, ctx: Pick<SecurityContext, "permissions">): boolean {
    const ds = this.analytics.dataset(r.spec.dataset);
    return Boolean(ds && canUseDataset(ds, ctx));
  }

  // ── Relatórios ──────────────────────────────────────────────────────────

  /** Prontos + da empresa, só os de temas que a pessoa pode ver. */
  async listReports(ctx: SecurityContext): Promise<ReportDefinition[]> {
    const custom = await this.reports.list(ctx.tenantId);
    return [...SYSTEM_REPORTS, ...custom].filter((r) => this.readable(r, ctx));
  }

  /** Sem checar permissão do tema (uso interno: painéis e agendamentos decidem). */
  async findReport(companyId: string, id: string): Promise<ReportDefinition | null> {
    return SYSTEM_REPORTS.find((r) => r.id === id) ?? (await this.reports.get(companyId, id));
  }

  async getReport(ctx: SecurityContext, id: string): Promise<ReportDefinition> {
    const r = await this.findReport(ctx.tenantId, id);
    if (!r) throw new AppError("not-found", "Relatório não encontrado.");
    if (!this.readable(r, ctx)) throw new AppError("forbidden", "Sem permissão para o tema deste relatório.");
    return r;
  }

  /** Valida a forma e compila contra o catálogo (nomes e permissão do tema). */
  private checkReport(body: unknown, ctx: SecurityContext) {
    const { errors, input } = validateReportInput(body);
    if (!input) throw new AppError("invalid", "Relatório inválido.", errors);
    const ds = this.analytics.dataset(input.spec.dataset);
    if (!ds) throw new AppError("invalid", `O tema '${input.spec.dataset}' não existe.`);
    // Lança QueryError com a mensagem certa (campo inexistente, sem permissão...).
    this.analytics.compile(withRange(input.spec, null, ds.defaultTimeDimension), ctx);
    return { input, category: ds.category };
  }

  async createReport(actor: Actor, body: unknown): Promise<ReportDefinition> {
    const { input, category } = this.checkReport(body, actor);
    return this.reports.create(actor.tenantId, input, category, author(actor));
  }

  async updateReport(actor: Actor, id: string, body: unknown): Promise<ReportDefinition> {
    if (SYSTEM_REPORTS.some((r) => r.id === id)) {
      throw new AppError("invalid", "Relatórios prontos não podem ser alterados. Duplique e edite a cópia.");
    }
    const current = await this.reports.get(actor.tenantId, id);
    if (!current) throw new AppError("not-found", "Relatório não encontrado.");
    if (!this.readable(current, actor)) throw new AppError("forbidden", "Sem permissão para o tema deste relatório.");
    const { input, category } = this.checkReport(body, actor);
    const updated = await this.reports.update(actor.tenantId, id, input, category, author(actor));
    if (!updated) throw new AppError("not-found", "Relatório não encontrado.");
    return updated;
  }

  async deleteReport(actor: Actor, id: string): Promise<void> {
    if (SYSTEM_REPORTS.some((r) => r.id === id)) throw new AppError("invalid", "Relatórios prontos não podem ser excluídos.");
    const current = await this.reports.get(actor.tenantId, id);
    if (!current) throw new AppError("not-found", "Relatório não encontrado.");
    if (!this.readable(current, actor)) throw new AppError("forbidden", "Sem permissão para o tema deste relatório.");
    await this.reports.delete(actor.tenantId, id);
    await this.cleanup.targetRemoved(actor.tenantId, "report", id);
  }

  // ── Painéis ─────────────────────────────────────────────────────────────

  async listDashboards(ctx: SecurityContext): Promise<DashboardDefinition[]> {
    return [...SYSTEM_DASHBOARDS, ...(await this.dashboards.list(ctx.tenantId))];
  }

  async findDashboard(companyId: string, id: string): Promise<DashboardDefinition | null> {
    return SYSTEM_DASHBOARDS.find((d) => d.id === id) ?? (await this.dashboards.get(companyId, id));
  }

  async getDashboard(ctx: SecurityContext, id: string): Promise<DashboardDefinition> {
    const d = await this.findDashboard(ctx.tenantId, id);
    if (!d) throw new AppError("not-found", "Painel não encontrado.");
    return d;
  }

  /** Itens do painel apontam para relatórios que existem e que a pessoa pode ver. */
  private async checkDashboard(body: unknown, ctx: SecurityContext) {
    const { errors, input } = validateDashboardInput(body);
    if (!input) throw new AppError("invalid", "Painel inválido.", errors);
    for (const w of input.widgets) {
      const r = await this.findReport(ctx.tenantId, w.reportId);
      if (!r) throw new AppError("invalid", "Um dos itens aponta para um relatório que não existe mais.");
      if (!this.readable(r, ctx)) throw new AppError("forbidden", `Sem permissão para o relatório '${r.name}'.`);
    }
    return input;
  }

  async createDashboard(actor: Actor, body: unknown): Promise<DashboardDefinition> {
    const input = await this.checkDashboard(body, actor);
    return this.dashboards.create(actor.tenantId, input, author(actor));
  }

  async updateDashboard(actor: Actor, id: string, body: unknown): Promise<DashboardDefinition> {
    if (SYSTEM_DASHBOARDS.some((d) => d.id === id)) {
      throw new AppError("invalid", "Painéis prontos não podem ser alterados. Duplique e edite a cópia.");
    }
    const input = await this.checkDashboard(body, actor);
    const updated = await this.dashboards.update(actor.tenantId, id, input, author(actor));
    if (!updated) throw new AppError("not-found", "Painel não encontrado.");
    return updated;
  }

  async deleteDashboard(actor: Actor, id: string): Promise<void> {
    if (SYSTEM_DASHBOARDS.some((d) => d.id === id)) throw new AppError("invalid", "Painéis prontos não podem ser excluídos.");
    if (!(await this.dashboards.delete(actor.tenantId, id))) throw new AppError("not-found", "Painel não encontrado.");
    await this.cleanup.targetRemoved(actor.tenantId, "dashboard", id);
  }
}
