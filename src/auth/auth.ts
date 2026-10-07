import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createHash } from "node:crypto";
import type { Request } from "express";
import { SecurityContext } from "../analytics/domain/types";
import { AppError } from "../common/errors";
import { isUuid } from "../database/db";

/** Usuário autenticado, como a API principal o descreve em `/auth/me`. */
export interface Principal {
  userId: string;
  name: string;
  companyId: string;
  permissions: string[];
}

export const toContext = (p: Principal): SecurityContext => ({
  tenantId: p.companyId,
  userId: p.userId,
  permissions: p.permissions,
});

export interface IdentityProvider {
  /** null = token inválido/expirado. Lança se a API principal estiver fora. */
  resolve(token: string): Promise<Principal | null>;
}
export const IDENTITY_PROVIDER = Symbol("IDENTITY_PROVIDER");

/**
 * Valida o token na própria API principal (`GET /auth/me`), que devolve empresa
 * e permissões efetivas. Assim revogação de sessão, usuário desativado e
 * mudança de permissão valem aqui (no máximo após o TTL do cache), sem
 * duplicar a regra de RBAC nem conhecer o segredo do JWT.
 */
@Injectable()
export class MainApiIdentityProvider implements IdentityProvider {
  private readonly logger = new Logger(MainApiIdentityProvider.name);
  private readonly cache = new Map<string, { at: number; principal: Principal | null }>();
  private static readonly MAX_ENTRIES = 5_000;

  constructor(
    private readonly mainApiUrl: string,
    private readonly ttlMs: number,
  ) {}

  async resolve(token: string): Promise<Principal | null> {
    const key = createHash("sha256").update(token).digest("hex");
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.principal;

    let res: Response;
    try {
      res = await fetch(`${this.mainApiUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      });
    } catch (error) {
      this.logger.warn(`API principal fora do ar ao validar o token: ${(error as Error).message}`);
      throw new AppError("unavailable", "Não foi possível validar o acesso agora.");
    }
    if (res.status === 401 || res.status === 403) return this.remember(key, null);
    if (!res.ok) throw new AppError("unavailable", "Não foi possível validar o acesso agora.");

    const body = (await res.json().catch(() => null)) as { data?: Record<string, any> } | null;
    const u = body?.data;
    if (!isUuid(u?.id) || !isUuid(u?.company?.id)) return this.remember(key, null);
    return this.remember(key, {
      userId: u.id,
      name: String(u.name ?? ""),
      companyId: u.company.id,
      permissions: Array.isArray(u.permissions) ? u.permissions.map(String) : [],
    });
  }

  private remember(key: string, principal: Principal | null): Principal | null {
    if (this.cache.size >= MainApiIdentityProvider.MAX_ENTRIES) this.cache.clear();
    this.cache.set(key, { at: Date.now(), principal });
    return principal;
  }
}

export const P_READ = "report:read";
export const P_MANAGE = "report:manage";

const PERMISSIONS_KEY = "queryx:permissions";
/** Permissões exigidas pela rota (todas). Sem o decorator: `report:read`. */
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);

const PUBLIC_KEY = "queryx:public";
export const Public = () => SetMetadata(PUBLIC_KEY, true);

function tokenOf(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7).trim() || null;
  return null;
}

/**
 * Guard global: exige o token da API principal (o proxy `/bi` do backend o
 * repassa como Bearer) e as permissões da rota. A empresa vem SEMPRE daqui.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(IDENTITY_PROVIDER) private readonly identity: IdentityProvider,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<Request & { principal?: Principal }>();
    const token = tokenOf(req);
    if (!token) throw new AppError("unauthenticated", "Faça login para ver os relatórios.");
    const principal = await this.identity.resolve(token);
    if (!principal) throw new AppError("unauthenticated", "Sessão expirada. Entre de novo.");

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [ctx.getHandler(), ctx.getClass()]) ?? [
      P_READ,
    ];
    const missing = required.filter((p) => !principal.permissions.includes(p));
    if (missing.length) throw new AppError("forbidden", `Sem permissão: ${missing.join(", ")}.`);
    req.principal = principal;
    return true;
  }
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Principal => ctx.switchToHttp().getRequest<{ principal: Principal }>().principal,
);
