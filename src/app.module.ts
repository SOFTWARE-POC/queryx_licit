import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  OnApplicationShutdown,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { Pool } from "pg";
import "./database/pg-types";
import { ANALYTICS_DB, AnalyticsService, CATALOG, TIMEZONE } from "./analytics/application/analytics.service";
import { buildCatalog } from "./analytics/domain/semantic/registry";
import { AuthGuard, IDENTITY_PROVIDER, MainApiIdentityProvider } from "./auth/auth";
import { HttpErrorFilter } from "./common/http/http-error.filter";
import { APP_CONFIG, AppConfig, loadConfig } from "./config/app-config";
import { DB } from "./database/db";
import { ExportService } from "./delivery/application/export.service";
import { DIRECTORY, MAILER, Mailer, SCHEDULE_REPOSITORY } from "./delivery/application/ports";
import { PANEL_URL, ScheduleCleanup, SchedulesService } from "./delivery/application/schedules.service";
import { DisabledMailer, LogMailer, ResendMailer, SmtpMailer } from "./delivery/infrastructure/mailers";
import { PgDirectory, PgScheduleRepository } from "./delivery/infrastructure/pg-schedules";
import {
  AnalyticsController,
  DashboardsController,
  HealthController,
  MeController,
  ReportsController,
  SchedulesController,
} from "./http/controllers";
import { DASHBOARD_REPOSITORY, DB_SCHEMA, REPORT_REPOSITORY } from "./reports/application/ports";
import { ReportsService, TARGET_CLEANUP } from "./reports/application/reports.service";
import { PgDashboardRepository, PgReportRepository } from "./reports/infrastructure/pg-repositories";

function mailerFor(config: AppConfig): Mailer {
  switch (config.mail.provider) {
    case "smtp":
      return new SmtpMailer(config.mail.smtpUrl!, config.mail.from);
    case "resend":
      return new ResendMailer(config.mail.resendApiKey!, config.mail.from);
    case "log":
      return new LogMailer();
    default:
      return new DisabledMailer();
  }
}

/**
 * Dois pools: o de escrita (schema do serviço) e o de consultas do BI, só de
 * leitura e com tempo máximo por comando. Uma consulta pesada não trava o
 * banco e nenhum SQL do BI consegue escrever, mesmo com um bug no compilador.
 */
@Global()
@Module({
  providers: [
    { provide: APP_CONFIG, useFactory: () => loadConfig() },
    {
      provide: DB,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) => new Pool({ connectionString: c.databaseUrl, max: c.dbPoolMax }),
    },
    {
      provide: ANALYTICS_DB,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) =>
        new Pool({
          connectionString: c.databaseUrl,
          max: c.dbPoolMax,
          options: `-c default_transaction_read_only=on -c statement_timeout=${c.queryTimeoutMs}`,
        }),
    },
    { provide: DB_SCHEMA, inject: [APP_CONFIG], useFactory: (c: AppConfig) => c.dbSchema },
    { provide: TIMEZONE, inject: [APP_CONFIG], useFactory: (c: AppConfig) => c.timezone },
    { provide: PANEL_URL, inject: [APP_CONFIG], useFactory: (c: AppConfig) => c.panelUrl },
    {
      provide: CATALOG,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) =>
        buildCatalog({
          standardWorkdayMinutes: c.standardWorkdayMinutes,
          lateToleranceMinutes: c.lateToleranceMinutes,
          earlyLeaveToleranceMinutes: c.earlyLeaveToleranceMinutes,
        }),
    },
    {
      provide: IDENTITY_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) => new MainApiIdentityProvider(c.mainApiUrl, c.authCacheTtlMs),
    },
    { provide: MAILER, inject: [APP_CONFIG], useFactory: mailerFor },
  ],
  exports: [APP_CONFIG, DB, ANALYTICS_DB, DB_SCHEMA, TIMEZONE, PANEL_URL, CATALOG, IDENTITY_PROVIDER, MAILER],
})
export class InfraModule implements OnApplicationShutdown {
  constructor(
    @Inject(DB) private readonly db: { end?: () => Promise<void> },
    @Inject(ANALYTICS_DB) private readonly analyticsDb: { end?: () => Promise<void> },
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([this.db.end?.(), this.analyticsDb.end?.()]);
  }
}

/** Relógio dos envios agendados: confere a cada minuto o que venceu. */
@Injectable()
export class ScheduleClock implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("ScheduleClock");
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly schedules: SchedulesService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    if (!this.config.schedulerEnabled) return;
    this.timer = setInterval(() => void this.tick(), 60_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const n = await this.schedules.runDue();
      if (n) this.logger.log(`${n} envio(s) agendado(s) processado(s)`);
    } catch (error) {
      this.logger.error(`Falha ao processar envios agendados: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}

@Module({
  imports: [
    InfraModule,
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) => [{ ttl: 60_000, limit: c.throttleLimit }],
    }),
  ],
  controllers: [
    HealthController,
    MeController,
    AnalyticsController,
    ReportsController,
    DashboardsController,
    SchedulesController,
  ],
  providers: [
    AnalyticsService,
    ReportsService,
    ExportService,
    SchedulesService,
    ScheduleClock,
    { provide: REPORT_REPOSITORY, useClass: PgReportRepository },
    { provide: DASHBOARD_REPOSITORY, useClass: PgDashboardRepository },
    { provide: SCHEDULE_REPOSITORY, useClass: PgScheduleRepository },
    { provide: DIRECTORY, useClass: PgDirectory },
    { provide: TARGET_CLEANUP, useClass: ScheduleCleanup },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: HttpErrorFilter },
  ],
})
export class AppModule {}
