import { isValidTimezone } from "../analytics/domain/period";
import { schemaName } from "../database/db";

/** Configuração tipada e validada no boot: o serviço não sobe com env errado. */
export interface AppConfig {
  port: number;
  production: boolean;
  databaseUrl: string;
  dbSchema: string;
  dbPoolMax: number;
  mainApiUrl: string;
  timezone: string;
  standardWorkdayMinutes: number;
  lateToleranceMinutes: number;
  earlyLeaveToleranceMinutes: number;
  authCacheTtlMs: number;
  queryTimeoutMs: number;
  trustProxy: string | undefined;
  throttleLimit: number;
  schedulerEnabled: boolean;
  mail: { provider: "disabled" | "log" | "smtp" | "resend"; from: string; smtpUrl?: string; resendApiKey?: string };
  panelUrl: string | null;
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

const str = (env: Record<string, unknown>, key: string) => (typeof env[key] === "string" ? (env[key] as string).trim() : "");

function url(value: string, key: string): string {
  const u = value.replace(/\/+$/, "");
  if (!/^https?:\/\//.test(u)) throw new Error(`${key} deve começar com http:// ou https://.`);
  return u;
}

export function loadConfig(env: Record<string, unknown> = process.env): AppConfig {
  const production = env.NODE_ENV === "production";
  const timezone = str(env, "REPORTS_TIMEZONE") || "America/Sao_Paulo";
  if (!isValidTimezone(timezone)) throw new Error(`REPORTS_TIMEZONE inválido: ${timezone}`);

  const provider = (str(env, "MAIL_PROVIDER") || "disabled") as AppConfig["mail"]["provider"];
  if (!["disabled", "log", "smtp", "resend"].includes(provider)) {
    throw new Error("MAIL_PROVIDER deve ser disabled, log, smtp ou resend.");
  }
  const from = str(env, "MAIL_FROM");
  if ((provider === "smtp" || provider === "resend") && !from) throw new Error("MAIL_FROM é obrigatório para enviar e-mail.");
  if (provider === "smtp" && !str(env, "SMTP_URL")) throw new Error("SMTP_URL é obrigatório com MAIL_PROVIDER=smtp.");
  if (provider === "resend" && !str(env, "RESEND_API_KEY")) throw new Error("RESEND_API_KEY é obrigatório com MAIL_PROVIDER=resend.");

  const panel = str(env, "PANEL_URL");
  return {
    port: int(env, "PORT", 3000, 1, 65535),
    production,
    databaseUrl: required(env, "DATABASE_URL"),
    dbSchema: schemaName(str(env, "DB_SCHEMA")),
    dbPoolMax: int(env, "DB_POOL_MAX", 10, 1, 100),
    mainApiUrl: url(required(env, "MAIN_API_URL"), "MAIN_API_URL"),
    timezone,
    standardWorkdayMinutes: int(env, "STANDARD_WORKDAY_MINUTES", 480, 60, 1440),
    lateToleranceMinutes: int(env, "LATE_TOLERANCE_MINUTES", 10, 0, 240),
    earlyLeaveToleranceMinutes: int(env, "EARLY_LEAVE_TOLERANCE_MINUTES", 10, 0, 240),
    authCacheTtlMs: int(env, "AUTH_CACHE_TTL_SECONDS", 30, 0, 300) * 1000,
    queryTimeoutMs: int(env, "QUERY_TIMEOUT_MS", 15000, 1000, 120000),
    trustProxy: env.TRUST_PROXY as string | undefined,
    throttleLimit: int(env, "THROTTLE_LIMIT", 600, 10, 100000),
    schedulerEnabled: str(env, "SCHEDULER_ENABLED") !== "false",
    mail: {
      provider,
      from,
      smtpUrl: str(env, "SMTP_URL") || undefined,
      resendApiKey: str(env, "RESEND_API_KEY") || undefined,
    },
    panelUrl: panel ? url(panel, "PANEL_URL") : null,
  };
}
