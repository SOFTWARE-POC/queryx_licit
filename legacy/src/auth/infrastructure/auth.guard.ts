import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AppError } from "../../common/errors";
import { IDENTITY_PROVIDER, IdentityProviderPort } from "../domain/identity-provider.port";
import { hasPermission, ReportPermission } from "../domain/principal";
import { IS_PUBLIC, REQUIRED_PERMISSION } from "./decorators";
import { extractToken } from "./session-cookie";

/**
 * Guard global: toda rota exige sessão válida (resolvida na API principal), a não
 * ser que seja `@Public()`. Com `@RequirePermission`, exige também a permissão.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(IDENTITY_PROVIDER) private readonly identity: IdentityProviderPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = context.switchToHttp().getRequest<Request & { principal?: unknown }>();
    const token = extractToken(req);
    if (!token) throw new AppError("unauthenticated", "Entre para ver os relatórios.");

    const principal = await this.identity.introspect(token, req.ip);
    req.principal = principal;

    const required = this.reflector.getAllAndOverride<ReportPermission | undefined>(REQUIRED_PERMISSION, targets);
    if (required && !hasPermission(principal, required)) {
      throw new AppError(
        "forbidden",
        required === ReportPermission.MANAGE
          ? "Seu perfil pode ver relatórios, mas não criar ou editar. Peça a permissão report:manage ao administrador."
          : "Seu perfil não tem acesso aos relatórios. Peça a permissão report:read ao administrador.",
      );
    }
    return true;
  }
}
