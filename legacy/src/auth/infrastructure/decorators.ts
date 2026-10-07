import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import { Principal, ReportPermission } from "../domain/principal";

export const IS_PUBLIC = "auth:public";
export const REQUIRED_PERMISSION = "auth:permission";

/** Rota sem sessão (login, health). Todo o resto exige autenticação. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const RequirePermission = (permission: ReportPermission) =>
  SetMetadata(REQUIRED_PERMISSION, permission);

export const CurrentPrincipal = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Principal => ctx.switchToHttp().getRequest().principal,
);
