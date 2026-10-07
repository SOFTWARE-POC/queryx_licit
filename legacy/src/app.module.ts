import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AppConfigModule } from "./config/config.module";
import { APP_CONFIG, AppConfig } from "./config/app-config";
import { DatabaseModule } from "./database/database.module";
import { AuthModule } from "./auth/auth.module";
import { AuthGuard } from "./auth/infrastructure/auth.guard";
import { AnalyticsModule } from "./analytics/analytics.module";
import { ReportsModule } from "./reports/reports.module";
import { HealthController } from "./health/health.controller";
import { HttpErrorFilter } from "./common/http/http-error.filter";

@Module({
  imports: [
    AppConfigModule,
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => [{ ttl: 60_000, limit: config.throttleLimit }],
    }),
    DatabaseModule,
    AuthModule,
    AnalyticsModule,
    ReportsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Ordem importa: rate limit antes de gastar uma chamada à API principal.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_FILTER, useClass: HttpErrorFilter },
  ],
})
export class AppModule {}
