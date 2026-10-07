/**
 * O mínimo que os adapters usam do banco. `pg.Pool`/`pg.Client` e o PGlite dos
 * testes atendem a mesma interface.
 */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export const DB = Symbol("DB");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

const SCHEMA_RE = /^[a-z_][a-z0-9_]{0,62}$/;

/** Nome do schema do serviço, validado (entra no SQL como identificador). */
export function schemaName(raw: string | undefined): string {
  const s = (raw ?? "").trim() || "relatorios";
  if (!SCHEMA_RE.test(s)) throw new Error(`DB_SCHEMA inválido: "${s}"`);
  return s;
}

/** Valores do driver para JSON: bigint/numeric (texto no pg) viram número. */
export function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const toIso = (v: unknown): string | null =>
  v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
