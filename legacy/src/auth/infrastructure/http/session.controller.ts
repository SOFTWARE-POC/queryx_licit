import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { APP_CONFIG, AppConfig } from "../../../config/app-config";
import { AppError } from "../../../common/errors";
import { IDENTITY_PROVIDER, IdentityProviderPort } from "../../domain/identity-provider.port";
import { hasPermission, Principal, ReportPermission } from "../../domain/principal";
import { CurrentPrincipal, Public } from "../decorators";
import { extractToken, SESSION_COOKIE, sessionCookieOptions } from "../session-cookie";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function toSessionView(p: Principal, timezone: string) {
  return {
    timezone,
    name: p.name,
    email: p.email,
    company: { id: p.companyId, name: p.companyName },
    role: p.roleName,
    canManage: hasPermission(p, ReportPermission.MANAGE),
  };
}

function parseLogin(body: unknown): { cpf: string; password: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const cpf = typeof b.cpf === "string" ? b.cpf.replace(/\D/g, "") : "";
  const password = typeof b.password === "string" ? b.password : "";
  const errors: string[] = [];
  if (cpf.length !== 11) errors.push("Informe o CPF com 11 dígitos.");
  if (!password || password.length > 200) errors.push("Informe a senha.");
  if (errors.length) throw new AppError("invalid", errors.join(" "), errors);
  return { cpf, password };
}

/**
 * Sessão do front (BFF): o login é feito na API principal e o token fica num
 * cookie httpOnly DESTE domínio — o JavaScript do navegador nunca vê o token, e
 * o front não precisa de CORS com a API principal.
 */
@Controller("session")
export class SessionController {
  constructor(
    @Inject(IDENTITY_PROVIDER) private readonly identity: IdentityProviderPort,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("login")
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { cpf, password } = parseLogin(body);
    const { token, principal, expiresAt } = await this.identity.login(cpf, password, req.ip);

    if (!hasPermission(principal, ReportPermission.READ)) {
      throw new AppError(
        "forbidden",
        "Seu perfil não tem acesso aos relatórios. Peça a permissão report:read ao administrador.",
      );
    }

    const maxAge = expiresAt ? Math.max(0, expiresAt.getTime() - Date.now()) : SEVEN_DAYS_MS;
    res.cookie(SESSION_COOKIE, token, { ...sessionCookieOptions(this.config.cookieSecure), maxAge });
    return toSessionView(principal, this.config.timezone);
  }

  @Get()
  me(@CurrentPrincipal() principal: Principal) {
    return toSessionView(principal, this.config.timezone);
  }

  @Public()
  @Post("logout")
  @HttpCode(204)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): void {
    const token = extractToken(req);
    if (token) this.identity.forget(token);
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions(this.config.cookieSecure));
  }
}
