import { createHash } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { APP_CONFIG, AppConfig } from "../../config/app-config";
import { AppError } from "../../common/errors";
import { IdentityProviderPort, LoginResult } from "../domain/identity-provider.port";
import { Principal } from "../domain/principal";

const REQUEST_TIMEOUT_MS = 5_000;
const MAX_CACHE_ENTRIES = 5_000;

interface UpstreamUser {
  id?: string;
  name?: string;
  email?: string;
  company?: { id?: string; razaoSocial?: string };
  role?: { name?: string; permissions?: string[] };
}

function toPrincipal(user: UpstreamUser | undefined): Principal {
  if (!user?.id || !user.company?.id || !user.role?.name) {
    throw new AppError("unavailable", "A API principal respondeu um perfil de usuário incompleto.");
  }
  return {
    userId: user.id,
    name: user.name ?? "",
    email: user.email ?? "",
    companyId: user.company.id,
    companyName: user.company.razaoSocial ?? "",
    roleName: user.role.name,
    permissions: Array.isArray(user.role.permissions) ? user.role.permissions : [],
  };
}

/** `exp` do JWT, só pra dar a mesma validade ao cookie (a assinatura quem valida é a API). */
function tokenExpiry(token: string): Date | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.exp === "number" ? new Date(payload.exp * 1000) : null;
  } catch {
    return null;
  }
}

async function readMessage(res: Response): Promise<string | undefined> {
  const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
  return typeof body?.message === "string" ? body.message : undefined;
}

/**
 * Identidade via API principal: `POST /auth/login` e `GET /auth/me`.
 *
 * Cache curto por token (AUTH_CACHE_TTL_SECONDS, padrão 15s): um relatório dispara
 * várias consultas em paralelo e não faz sentido perguntar à API a cada uma. O
 * preço é que revogação/desativação leva até o TTL pra valer aqui.
 *
 * Encaminha o IP do usuário em `X-Forwarded-For` — com a API principal acessada
 * pela rede privada (sem proxy no meio), o rate limit dela conta por usuário e
 * não pelo IP deste serviço.
 */
@Injectable()
export class MainApiIdentityAdapter implements IdentityProviderPort {
  private readonly logger = new Logger(MainApiIdentityAdapter.name);
  private readonly cache = new Map<string, { principal: Principal; expiresAt: number }>();

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  private key(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private headers(clientIp?: string, token?: string): Record<string, string> {
    return {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(clientIp ? { "X-Forwarded-For": clientIp } : {}),
    };
  }

  private async call(path: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(`${this.config.mainApiUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(`API principal inacessível (${path}): ${(error as Error).message}`);
      throw new AppError("unavailable", "Não foi possível falar com a API principal. Tente de novo em instantes.");
    }
  }

  async introspect(token: string, clientIp?: string): Promise<Principal> {
    const key = this.key(token);
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.principal;
    if (hit) this.cache.delete(key);

    const res = await this.call("/auth/me", { method: "GET", headers: this.headers(clientIp, token) });

    if (res.status === 401 || res.status === 403 || res.status === 404) {
      throw new AppError("unauthenticated", (await readMessage(res)) ?? "Sessão inválida. Entre novamente.");
    }
    if (res.status === 429) {
      throw new AppError("too-many-requests", "Muitas requisições. Aguarde alguns segundos.");
    }
    if (!res.ok) {
      this.logger.error(`GET /auth/me respondeu ${res.status}`);
      throw new AppError("unavailable", "A API principal não conseguiu validar a sessão.");
    }

    const body = (await res.json()) as { data?: UpstreamUser };
    const principal = toPrincipal(body.data);

    if (this.config.authCacheTtlMs > 0) {
      if (this.cache.size >= MAX_CACHE_ENTRIES) {
        // Map mantém ordem de inserção: remove a entrada mais antiga.
        this.cache.delete(this.cache.keys().next().value as string);
      }
      this.cache.set(key, { principal, expiresAt: Date.now() + this.config.authCacheTtlMs });
    }
    return principal;
  }

  async login(cpf: string, password: string, clientIp?: string): Promise<LoginResult> {
    const res = await this.call("/auth/login", {
      method: "POST",
      headers: { ...this.headers(clientIp), "Content-Type": "application/json" },
      body: JSON.stringify({ cpf, password }),
    });

    if (res.status === 400 || res.status === 401 || res.status === 403) {
      throw new AppError("unauthenticated", (await readMessage(res)) ?? "CPF ou senha incorretos.");
    }
    if (res.status === 429) {
      throw new AppError("too-many-requests", "Muitas tentativas de login. Aguarde um minuto e tente de novo.");
    }
    if (!res.ok) {
      this.logger.error(`POST /auth/login respondeu ${res.status}`);
      throw new AppError("unavailable", "A API principal não conseguiu fazer o login agora.");
    }

    const body = (await res.json()) as { data?: { token?: string; user?: UpstreamUser } };
    const token = body.data?.token;
    if (!token) throw new AppError("unavailable", "A API principal não devolveu um token.");

    return { token, principal: toPrincipal(body.data?.user), expiresAt: tokenExpiry(token) };
  }

  forget(token: string): void {
    this.cache.delete(this.key(token));
  }
}
