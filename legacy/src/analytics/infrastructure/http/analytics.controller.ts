import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";
import { AppError } from "../../../common/errors";
import { CurrentPrincipal, RequirePermission } from "../../../auth/infrastructure/decorators";
import { Principal, ReportPermission } from "../../../auth/domain/principal";
import { validateQuerySpec } from "../../domain/validation";
import { RunQueryUseCase } from "../../application/run-query.use-case";
import { GetCatalogUseCase } from "../../application/get-catalog.use-case";

@Controller("analytics")
@RequirePermission(ReportPermission.READ)
export class AnalyticsController {
  constructor(
    private readonly runQuery: RunQueryUseCase,
    private readonly getCatalog: GetCatalogUseCase,
  ) {}

  /** Executa uma QuerySpec. Tenant vem SEMPRE da sessão. */
  @Post("query")
  @HttpCode(200)
  query(@Body() body: unknown, @CurrentPrincipal() principal: Principal) {
    const { errors, spec } = validateQuerySpec(body);
    if (!spec) throw new AppError("invalid", "Consulta inválida.", errors);
    return this.runQuery.execute(spec, { tenantId: principal.companyId, userId: principal.userId });
  }

  @Get("meta")
  meta() {
    return { datasets: this.getCatalog.execute() };
  }
}
