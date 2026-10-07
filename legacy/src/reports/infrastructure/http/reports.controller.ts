import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { CurrentPrincipal, RequirePermission } from "../../../auth/infrastructure/decorators";
import { Principal, ReportPermission } from "../../../auth/domain/principal";
import { ReportsService } from "../../application/reports.use-cases";

@Controller("reports")
@RequirePermission(ReportPermission.READ)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal) {
    return this.reports.list(principal);
  }

  @Get(":id")
  get(@CurrentPrincipal() principal: Principal, @Param("id") id: string) {
    return this.reports.get(principal, id);
  }

  @RequirePermission(ReportPermission.MANAGE)
  @Post()
  create(@CurrentPrincipal() principal: Principal, @Body() body: unknown) {
    return this.reports.create(principal, body);
  }

  @RequirePermission(ReportPermission.MANAGE)
  @Put(":id")
  update(@CurrentPrincipal() principal: Principal, @Param("id") id: string, @Body() body: unknown) {
    return this.reports.update(principal, id, body);
  }

  @RequirePermission(ReportPermission.MANAGE)
  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<void> {
    await this.reports.remove(principal, id);
  }
}
