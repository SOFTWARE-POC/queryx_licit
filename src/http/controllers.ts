import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { AnalyticsService, TIMEZONE } from "../analytics/application/analytics.service";
import { isCalendarDate, PERIOD_LABELS, resolvePreset } from "../analytics/domain/period";
import { isObject, validateQuerySpec, validateRecordsSpec } from "../analytics/domain/validation";
import { CurrentUser, P_MANAGE, P_READ, Principal, Public, RequirePermissions, toContext } from "../auth/auth";
import { AppError } from "../common/errors";
import { DB, Db } from "../database/db";
import { fileSlug } from "../delivery/application/export";
import { ExportFile, ExportService } from "../delivery/application/export.service";
import { SchedulesService } from "../delivery/application/schedules.service";
import { Actor, ReportsService } from "../reports/application/reports.service";

const actorOf = (p: Principal): Actor => ({ ...toContext(p), name: p.name });

function sendFile(res: Response, file: ExportFile): void {
  const ascii = file.filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  res.status(200);
  res.setHeader("Content-Type", file.contentType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
  );
  res.setHeader("Cache-Control", "no-store");
  res.end(file.content);
}

function formatOf(raw: unknown): "XLSX" | "CSV" {
  const f = String(raw ?? "xlsx").toUpperCase();
  if (f !== "XLSX" && f !== "CSV") throw new AppError("invalid", "Formato deve ser xlsx ou csv.");
  return f;
}

/** `from`/`to` da query string (os dois ou nenhum). */
function rangeOf(from: unknown, to: unknown): [string, string] | null {
  if (from === undefined && to === undefined) return null;
  if (!isCalendarDate(from) || !isCalendarDate(to)) throw new AppError("invalid", "Período inválido (use AAAA-MM-DD).");
  if (from > to) throw new AppError("invalid", "O início do período precisa ser antes do fim.");
  return [from, to];
}

@Controller()
export class HealthController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Public()
  @Get("health")
  async health() {
    await this.db.query("SELECT 1");
    return { status: "ok" };
  }
}

@Controller("me")
export class MeController {
  constructor(
    private readonly schedules: SchedulesService,
    @Inject(TIMEZONE) private readonly timezone: string,
  ) {}

  /** O que a tela precisa saber: quem é, se pode gerenciar, se há e-mail e os períodos. */
  @Get()
  me(@CurrentUser() user: Principal) {
    return {
      data: {
        user: { id: user.userId, name: user.name },
        canManage: user.permissions.includes(P_MANAGE),
        mailEnabled: this.schedules.mailEnabled,
        timezone: this.timezone,
        periods: PERIOD_LABELS,
      },
    };
  }
}

@Controller("analytics")
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly exporter: ExportService,
  ) {}

  @Get("catalog")
  catalog(@CurrentUser() user: Principal) {
    return { data: this.analytics.catalogView(toContext(user)) };
  }

  @Post("query")
  @HttpCode(200)
  async query(@CurrentUser() user: Principal, @Body() body: unknown) {
    const { errors, spec } = validateQuerySpec(body);
    if (!spec) throw new AppError("invalid", "Consulta inválida.", errors);
    return { data: await this.analytics.query(spec, toContext(user)) };
  }

  @Post("records")
  @HttpCode(200)
  async records(@CurrentUser() user: Principal, @Body() body: unknown) {
    const { errors, spec } = validateRecordsSpec(body);
    if (!spec) throw new AppError("invalid", "Pedido inválido.", errors);
    return { data: await this.analytics.records(spec, toContext(user)) };
  }

  @Post("values")
  @HttpCode(200)
  async values(@CurrentUser() user: Principal, @Body() body: unknown) {
    if (!isObject(body) || typeof body.dataset !== "string" || typeof body.dimension !== "string") {
      throw new AppError("invalid", "Informe o tema e o campo.");
    }
    const search = typeof body.search === "string" ? body.search.slice(0, 100) : undefined;
    return { data: await this.analytics.values({ dataset: body.dataset, dimension: body.dimension, search }, toContext(user)) };
  }

  /** Exporta uma consulta qualquer (a do construtor, antes de salvar). */
  @Post("export")
  async export(@CurrentUser() user: Principal, @Body() body: unknown, @Res() res: Response) {
    if (!isObject(body)) throw new AppError("invalid", "Pedido inválido.");
    const { errors, spec } = validateQuerySpec(body.spec);
    if (!spec) throw new AppError("invalid", "Consulta inválida.", errors);
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : "Relatório";
    const table = await this.exporter.adhoc(spec, title, toContext(user));
    sendFile(res, await this.exporter.file([table], formatOf(body.format), fileSlug(title)));
  }
}

@Controller("reports")
@RequirePermissions(P_READ)
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly exporter: ExportService,
    @Inject(TIMEZONE) private readonly timezone: string,
  ) {}

  @Get()
  async list(@CurrentUser() user: Principal) {
    return { data: await this.reports.listReports(toContext(user)) };
  }

  @Get(":id")
  async get(@CurrentUser() user: Principal, @Param("id") id: string) {
    return { data: await this.reports.getReport(toContext(user), id) };
  }

  @Get(":id/export")
  async export(
    @CurrentUser() user: Principal,
    @Param("id") id: string,
    @Query("format") format: string,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Res() res: Response,
  ) {
    const ctx = toContext(user);
    const report = await this.reports.getReport(ctx, id);
    const range = rangeOf(from, to) ?? (report.defaultPeriod ? resolvePreset(report.defaultPeriod, this.timezone) : null);
    const { table } = await this.exporter.reportTable(report, range, ctx);
    const suffix = table.subtitle && range ? `-${range[0]}-a-${range[1]}` : "";
    sendFile(res, await this.exporter.file([table], formatOf(format), `${fileSlug(report.name)}${suffix}`));
  }

  @Post()
  @RequirePermissions(P_READ, P_MANAGE)
  async create(@CurrentUser() user: Principal, @Body() body: unknown) {
    return { data: await this.reports.createReport(actorOf(user), body) };
  }

  @Put(":id")
  @RequirePermissions(P_READ, P_MANAGE)
  async update(@CurrentUser() user: Principal, @Param("id") id: string, @Body() body: unknown) {
    return { data: await this.reports.updateReport(actorOf(user), id, body) };
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermissions(P_READ, P_MANAGE)
  async remove(@CurrentUser() user: Principal, @Param("id") id: string) {
    await this.reports.deleteReport(actorOf(user), id);
  }
}

@Controller("dashboards")
@RequirePermissions(P_READ)
export class DashboardsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly exporter: ExportService,
    @Inject(TIMEZONE) private readonly timezone: string,
  ) {}

  @Get()
  async list(@CurrentUser() user: Principal) {
    return { data: await this.reports.listDashboards(toContext(user)) };
  }

  @Get(":id")
  async get(@CurrentUser() user: Principal, @Param("id") id: string) {
    return { data: await this.reports.getDashboard(toContext(user), id) };
  }

  @Get(":id/export")
  async export(
    @CurrentUser() user: Principal,
    @Param("id") id: string,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Res() res: Response,
  ) {
    const ctx = toContext(user);
    const dashboard = await this.reports.getDashboard(ctx, id);
    const range = rangeOf(from, to) ?? resolvePreset(dashboard.defaultPeriod, this.timezone);
    const { tables } = await this.exporter.dashboardTables(dashboard, range, ctx);
    if (!tables.length) throw new AppError("forbidden", "Nenhum item deste painel está liberado para você.");
    sendFile(res, await this.exporter.file(tables, "XLSX", `${fileSlug(dashboard.name)}-${range[0]}-a-${range[1]}`));
  }

  @Post()
  @RequirePermissions(P_READ, P_MANAGE)
  async create(@CurrentUser() user: Principal, @Body() body: unknown) {
    return { data: await this.reports.createDashboard(actorOf(user), body) };
  }

  @Put(":id")
  @RequirePermissions(P_READ, P_MANAGE)
  async update(@CurrentUser() user: Principal, @Param("id") id: string, @Body() body: unknown) {
    return { data: await this.reports.updateDashboard(actorOf(user), id, body) };
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermissions(P_READ, P_MANAGE)
  async remove(@CurrentUser() user: Principal, @Param("id") id: string) {
    await this.reports.deleteDashboard(actorOf(user), id);
  }
}

/** Envios agendados: só quem gerencia relatórios. */
@Controller("schedules")
@RequirePermissions(P_READ, P_MANAGE)
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get()
  async list(@CurrentUser() user: Principal) {
    return { data: await this.schedules.list(actorOf(user)) };
  }

  @Get("recipients")
  async recipients(@CurrentUser() user: Principal) {
    return { data: await this.schedules.recipients(actorOf(user)) };
  }

  @Get(":id/runs")
  async runs(@CurrentUser() user: Principal, @Param("id") id: string) {
    return { data: await this.schedules.runs(actorOf(user), id) };
  }

  @Post()
  async create(@CurrentUser() user: Principal, @Body() body: unknown) {
    return { data: await this.schedules.create(actorOf(user), body) };
  }

  @Put(":id")
  async update(@CurrentUser() user: Principal, @Param("id") id: string, @Body() body: unknown) {
    return { data: await this.schedules.update(actorOf(user), id, body) };
  }

  @Post(":id/run")
  @HttpCode(200)
  async run(@CurrentUser() user: Principal, @Param("id") id: string) {
    return { data: await this.schedules.runNow(actorOf(user), id) };
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentUser() user: Principal, @Param("id") id: string) {
    await this.schedules.delete(actorOf(user), id);
  }
}
