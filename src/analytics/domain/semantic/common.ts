import { Dimension } from "../types";

/** Chaves de permissão da API principal (mesmo catálogo do RBAC). */
export const P = {
  REPORT_READ: "report:read",
  REPORT_MANAGE: "report:manage",
  SERVICE_ORDER_READ: "service-order:read",
  TIMECLOCK_READ: "timeclock:read",
  ABSENCE_READ: "absence:read",
  USER_READ: "user:read",
  AUDIT_READ: "audit:read",
  CONTRACT_READ: "contract:read",
  LICIT_READ: "licit:read",
  POPS_READ: "pops:read",
} as const;

export interface CatalogOptions {
  /** Jornada diária padrão (min) para "horas acima da jornada". */
  standardWorkdayMinutes: number;
  /** Tolerância (min) antes de contar atraso contra a escala. */
  lateToleranceMinutes: number;
}

/** Pessoa por id (agrupa pelo id: homônimos não se fundem). */
export const person = (title: string, keySql: string, nameSql: string, join: string): Dimension => ({
  title,
  type: "string",
  sql: nameSql,
  key: keySql,
  joins: [join],
  pii: true,
});

/** Join de usuário por id (só o nome é usado). */
export const userJoin = (alias: string, idSql: string) => ({
  sql: `LEFT JOIN public.users ${alias} ON ${alias}.id = ${idSql}`,
});

export const WEEKDAY_SQL = (dateSql: string) => `extract(isodow FROM ${dateSql})::int::text`;

/** Horas entre dois instantes. */
export const hoursBetween = (from: string, to: string) => `extract(epoch FROM (${to} - ${from})) / 3600.0`;

/**
 * Evento de cerca com ao menos um aviso enviado (e-mail ou WhatsApp) — a
 * evidência de que o gestor foi avisado fica em fence_alert_deliveries.
 */
export const alertedSql = (source: "SERVICE_ORDER" | "WORK_SITE") =>
  `EXISTS (SELECT 1 FROM public.fence_alert_deliveries fad WHERE fad.source = '${source}' AND fad.event_id = t.id AND fad.status = 'SENT')`;
