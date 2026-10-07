import { isValidTimezone } from "../analytics/domain/engine/zoned-date";

/** Configuração tipada e validada no boot — o serviço não sobe com env errado. */
export interface AppConfig {
  port: number;
  production: boolean;
  mongodbUri: string;
  mongodbDb?: string;
  mainApiUrl: string;
  timezone: string;
  standardWorkdayMinutes: number;
  authCacheTtlMs: number;
  queryTimeoutMs: number;
  trustProxy: string | undefined;
  throttleLimit: number;
  allowedOrigins: string[];
  cookieSecure: boolean;
  webDir: string;
}

export const APP_CONFIG = Symbol("APP_CONFIG");

function int(env: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${key} deve ser um inteiro entre ${min} e ${max} (recebido: ${String(raw)}).`);
  }
  return n;
}

function required(env: Record<string, unknown>, key: string): string {
  const v = env[key];
  if (typeof v !== "string" || !v.trim()) throw new Error(`${key} é obrigatório.`);
  return v.trim();
}

export function loadConfig(env: Record<string, unknown> = process.env): AppConfig {
  const production = env.NODE_ENV === "production";
  const mainApiUrl = required(env, "MAIN_API_URL").replace(/\/+$/, "");
  if (!/^https?:\/\//.test(mainApiUrl)) throw new Error("MAIN_API_URL deve começar com http:// ou https://.");

  const timezone = (env.REPORTS_TIMEZONE as string | undefined)?.trim() || "America/Sao_Paulo";
  if (!isValidTimezone(timezone)) throw new Error(`REPORTS_TIMEZONE inválido: ${timezone}`);

  return {
    port: int(env, "PORT", 3000, 1, 65535),
    production,
    mongodbUri: required(env, "MONGODB_URI"),
    mongodbDb: (env.MONGODB_DB as string | undefined)?.trim() || undefined,
    mainApiUrl,
    timezone,
    standardWorkdayMinutes: int(env, "STANDARD_WORKDAY_MINUTES", 480, 60, 1440),
    authCacheTtlMs: int(env, "AUTH_CACHE_TTL_SECONDS", 15, 0, 300) * 1000,
    queryTimeoutMs: int(env, "QUERY_TIMEOUT_MS", 15000, 1000, 120000),
    trustProxy: env.TRUST_PROXY as string | undefined,
    throttleLimit: int(env, "THROTTLE_LIMIT", 300, 10, 100000),
    allowedOrigins: String(env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    cookieSecure: env.COOKIE_SECURE === undefined ? production : env.COOKIE_SECURE === "true",
    webDir: (env.WEB_DIR as string | undefined)?.trim() || "web/dist",
  };
}
