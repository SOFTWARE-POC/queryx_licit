import { Inject, Injectable, Logger } from "@nestjs/common";
import { AnalyticsService, TIMEZONE } from "../../analytics/application/analytics.service";
import { canUseDataset } from "../../analytics/domain/engine/compile";
import { PERIOD_LABELS, resolvePreset } from "../../analytics/domain/period";
import { AppError } from "../../common/errors";
import { Actor, ReportsService, TargetCleanup } from "../../reports/application/reports.service";
import { nextRunAt, Schedule, validateScheduleInput } from "../domain/schedule";
import { displayValue, ExportTable, fileSlug } from "./export";
import { ExportService, rangeLabel } from "./export.service";
import {
  DIRECTORY,
  Directory,
  DirectoryPerson,
  MAILER,
  Mailer,
  SCHEDULE_REPOSITORY,
  ScheduleRepository,
  ScheduleRun,
} from "./ports";

export const PANEL_URL = Symbol("PANEL_URL");

/** Relatório/painel excluído: os agendamentos dele saem junto. */
@Injectable()
export class ScheduleCleanup implements TargetCleanup {
  constructor(@Inject(SCHEDULE_REPOSITORY) private readonly repo: ScheduleRepository) {}

  async targetRemoved(companyId: string, type: "report" | "dashboard", id: string): Promise<void> {
    await this.repo.deleteByTarget(companyId, type, id);
  }
}

export interface RunOutcome {
  status: ScheduleRun["status"];
  error: string | null;
  recipientCount: number;
  range: [string, string] | null;
}

const P_READ = "report:read";
const PREVIEW_ROWS = 15;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Envio agendado por e-mail. Roda com as permissões ATUAIS do dono do
 * agendamento, e cada destinatário só recebe se, hoje, for ativo na empresa e
 * puder ver relatórios e os temas do conteúdo. Um e-mail por pessoa (ninguém
 * vê o endereço dos outros).
 */
@Injectable()
export class SchedulesService {
  private readonly logger = new Logger(SchedulesService.name);

  constructor(
    @Inject(SCHEDULE_REPOSITORY) private readonly repo: ScheduleRepository,
    @Inject(DIRECTORY) private readonly directory: Directory,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly reports: ReportsService,
    private readonly exporter: ExportService,
    private readonly analytics: AnalyticsService,
    @Inject(TIMEZONE) private readonly timezone: string,
    @Inject(PANEL_URL) private readonly panelUrl: string | null,
  ) {}

  get mailEnabled(): boolean {
    return this.mailer.enabled;
  }

  list(actor: Actor) {
    return this.repo.list(actor.tenantId);
  }

  async get(actor: Actor, id: string) {
    const s = await this.repo.get(actor.tenantId, id);
    if (!s) throw new AppError("not-found", "Agendamento não encontrado.");
    return s;
  }

  /** Quem pode receber: ativos com e-mail e permissão de ver relatórios. */
  async recipients(actor: Actor) {
    return (await this.directory.people(actor.tenantId))
      .filter((p) => p.active && p.email && p.permissions.includes(P_READ))
      .map((p) => ({ id: p.id, name: p.name, email: p.email }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }

  private async checkInput(actor: Actor, body: unknown) {
    const { errors, input } = validateScheduleInput(body);
    if (!input) throw new AppError("invalid", "Agendamento inválido.", errors);
    if (input.targetType === "report") await this.reports.getReport(actor, input.targetId);
    else await this.reports.getDashboard(actor, input.targetId);
    const people = new Map((await this.directory.people(actor.tenantId)).map((p) => [p.id, p]));
    const unknown = input.recipients.filter((id) => !people.get(id)?.active);
    if (unknown.length) throw new AppError("invalid", "Há destinatários que não são pessoas ativas da empresa.");
    return input;
  }

  async create(actor: Actor, body: unknown, now = new Date()) {
    const input = await this.checkInput(actor, body);
    return this.repo.create(actor.tenantId, input, { id: actor.userId, name: actor.name }, nextRunAt(input, this.timezone, now));
  }

  /** Quem edita vira o dono (o envio passa a rodar com as permissões dele). */
  async update(actor: Actor, id: string, body: unknown, now = new Date()) {
    await this.get(actor, id);
    const input = await this.checkInput(actor, body);
    const updated = await this.repo.update(
      actor.tenantId,
      id,
      input,
      { id: actor.userId, name: actor.name },
      nextRunAt(input, this.timezone, now),
    );
    if (!updated) throw new AppError("not-found", "Agendamento não encontrado.");
    return updated;
  }

  async delete(actor: Actor, id: string) {
    if (!(await this.repo.delete(actor.tenantId, id))) throw new AppError("not-found", "Agendamento não encontrado.");
  }

  async runs(actor: Actor, id: string) {
    await this.get(actor, id);
    return this.repo.runs(actor.tenantId, id, 20);
  }

  /** "Enviar agora": não mexe no próximo horário. */
  async runNow(actor: Actor, id: string, now = new Date()): Promise<RunOutcome> {
    const s = await this.get(actor, id);
    return this.execute(s, "MANUAL", now);
  }

  /** Vencidos: roda e agenda o próximo (chamado pelo relógio do serviço). */
  async runDue(now = new Date(), limit = 10): Promise<number> {
    const due = await this.repo.claimDue(now, limit);
    for (const s of due) {
      const outcome = await this.execute(s, "AGENDADO", now);
      await this.repo.finish(s.id, {
        status: outcome.status,
        error: outcome.error,
        nextRunAt: nextRunAt(s, this.timezone, now),
      });
    }
    return due.length;
  }

  private async execute(s: Schedule, trigger: ScheduleRun["trigger"], now: Date): Promise<RunOutcome> {
    const startedAt = new Date();
    let outcome: RunOutcome;
    try {
      outcome = await this.deliver(s, now);
    } catch (error) {
      this.logger.warn(`Agendamento ${s.id} falhou: ${(error as Error).message}`);
      outcome = { status: "ERRO", error: (error as Error).message.slice(0, 500), recipientCount: 0, range: null };
    }
    await this.repo.addRun({
      scheduleId: s.id,
      companyId: s.companyId,
      trigger,
      status: outcome.status,
      recipientCount: outcome.recipientCount,
      range: outcome.range,
      error: outcome.error,
      startedAt,
    });
    if (trigger === "MANUAL") await this.repo.finish(s.id, { status: outcome.status, error: outcome.error, nextRunAt: null });
    return outcome;
  }

  private async deliver(s: Schedule, now: Date): Promise<RunOutcome> {
    const skip = (error: string, range: [string, string] | null = null): RunOutcome => ({
      status: "IGNORADO",
      error,
      recipientCount: 0,
      range,
    });
    if (!this.mailer.enabled) return { status: "ERRO", error: "Envio de e-mail não configurado no servidor.", recipientCount: 0, range: null };

    const owner = await this.directory.person(s.companyId, s.owner.id);
    if (!owner?.active || !owner.permissions.includes(P_READ)) {
      return skip("Quem criou o agendamento não tem mais acesso a relatórios. Edite-o para assumir o envio.");
    }
    const ctx = { tenantId: s.companyId, userId: owner.id, permissions: owner.permissions };
    const range = resolvePreset(s.period, this.timezone, now);

    let title: string;
    let tables: ExportTable[];
    let datasets: string[];
    if (s.targetType === "report") {
      const report = await this.reports.findReport(s.companyId, s.targetId);
      if (!report) return { status: "ERRO", error: "O relatório não existe mais.", recipientCount: 0, range };
      const ds = this.analytics.dataset(report.spec.dataset);
      if (!ds || !canUseDataset(ds, ctx)) return skip("Quem criou o agendamento não pode mais ver este relatório.", range);
      title = report.name;
      tables = [(await this.exporter.reportTable(report, range, ctx, now)).table];
      datasets = [ds.name];
    } else {
      const dashboard = await this.reports.findDashboard(s.companyId, s.targetId);
      if (!dashboard) return { status: "ERRO", error: "O painel não existe mais.", recipientCount: 0, range };
      title = dashboard.name;
      ({ tables, datasets } = await this.exporter.dashboardTables(dashboard, range, ctx, now));
      if (!tables.length) return skip("Nenhum item do painel pode ser visto por quem criou o agendamento.", range);
    }

    const requires = new Set(datasets.flatMap((d) => this.analytics.dataset(d)?.requires ?? []));
    const allowed = (p: DirectoryPerson) =>
      p.active && Boolean(p.email) && p.permissions.includes(P_READ) && [...requires].every((r) => p.permissions.includes(r));
    const people = (await this.directory.people(s.companyId)).filter((p) => s.recipients.includes(p.id) && allowed(p));
    if (!people.length) return skip("Nenhum destinatário pode ver este conteúdo hoje.", range);

    const file = await this.exporter.file(tables, s.format, `${fileSlug(title)}-${range[0]}-a-${range[1]}`);
    const subject = `${title} · ${PERIOD_LABELS[s.period]} (${rangeLabel(range)})`;
    const { html, text } = this.body(title, s, range, tables);
    let sent = 0;
    const failures: string[] = [];
    for (const p of people) {
      try {
        await this.mailer.send({ to: { email: p.email, name: p.name }, subject, html, text, attachments: [file] });
        sent++;
      } catch (error) {
        failures.push(`${p.name}: ${(error as Error).message}`);
      }
    }
    if (!sent) return { status: "ERRO", error: failures.join("; ").slice(0, 500), recipientCount: 0, range };
    return { status: "OK", error: failures.length ? failures.join("; ").slice(0, 500) : null, recipientCount: sent, range };
  }

  /** Corpo do e-mail: resumo das primeiras linhas; o arquivo vai anexo. */
  private body(title: string, s: Schedule, range: [string, string], tables: ExportTable[]) {
    const tz = this.timezone;
    const sections = tables.map((t) => {
      const rows = t.data.slice(0, PREVIEW_ROWS);
      const head = t.columns.map((c) => `<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #3b6fc9;font-size:12px;color:#384055">${escapeHtml(t.annotation[c]?.title ?? c)}</th>`).join("");
      const body = rows
        .map(
          (r) =>
            `<tr>${t.columns
              .map((c) => `<td style="padding:6px 8px;border-bottom:1px solid #e9e7e2;font-size:13px;color:#11192a">${escapeHtml(displayValue(r[c], t.annotation[c], tz))}</td>`)
              .join("")}</tr>`,
        )
        .join("");
      const more = t.data.length > PREVIEW_ROWS ? `<p style="font-size:12px;color:#6b7280">+ ${t.data.length - PREVIEW_ROWS} linhas no arquivo anexo.</p>` : "";
      const empty = t.data.length ? "" : `<p style="font-size:13px;color:#6b7280">Sem dados no período.</p>`;
      return `<h3 style="font-size:15px;color:#11192a;margin:24px 0 8px">${escapeHtml(t.title)}</h3>${empty}${
        t.data.length ? `<table style="border-collapse:collapse;width:100%">${`<thead><tr>${head}</tr></thead>`}<tbody>${body}</tbody></table>` : ""
      }${more}`;
    });
    const link = this.panelUrl ? `<p><a href="${escapeHtml(this.panelUrl)}/admin/relatorios" style="color:#3b6fc9">Abrir no painel</a></p>` : "";
    const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:760px">
      <h2 style="font-size:18px;color:#11192a;margin:0 0 4px">${escapeHtml(title)}</h2>
      <p style="font-size:13px;color:#6b7280;margin:0">${escapeHtml(PERIOD_LABELS[s.period])} · ${escapeHtml(rangeLabel(range))}</p>
      ${sections.join("")}
      ${link}
      <p style="font-size:11px;color:#9aa0aa;margin-top:28px">Envio agendado "${escapeHtml(s.name)}" por ${escapeHtml(s.owner.name)}. Para parar de receber, peça a quem gerencia os relatórios.</p>
    </div>`;
    const text = [
      title,
      `${PERIOD_LABELS[s.period]} · ${rangeLabel(range)}`,
      "",
      ...tables.map((t) => `${t.title}: ${t.data.length} linha(s) no anexo.`),
      this.panelUrl ? `\n${this.panelUrl}/admin/relatorios` : "",
    ].join("\n");
    return { html, text };
  }
}
