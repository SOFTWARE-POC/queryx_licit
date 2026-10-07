import { Granularity, QueryError } from "./types";

/**
 * Datas de calendário (`YYYY-MM-DD`) e períodos relativos ("últimos 30 dias",
 * "mês passado"...) num fuso. Usado pela consulta, pelo detalhamento e pelos
 * envios agendados (que rodam sem ninguém escolher o período na hora).
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const PERIOD_PRESETS = [
  "today",
  "yesterday",
  "last_7_days",
  "last_30_days",
  "this_month",
  "last_month",
  "this_quarter",
  "last_quarter",
  "this_year",
  "last_12_months",
] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  last_7_days: "Últimos 7 dias",
  last_30_days: "Últimos 30 dias",
  this_month: "Este mês",
  last_month: "Mês passado",
  this_quarter: "Este trimestre",
  last_quarter: "Trimestre passado",
  this_year: "Este ano",
  last_12_months: "Últimos 12 meses",
};

export const isPeriodPreset = (v: unknown): v is PeriodPreset =>
  typeof v === "string" && (PERIOD_PRESETS as readonly string[]).includes(v);

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** `YYYY-MM-DD` que existe no calendário. */
export function isCalendarDate(v: unknown): v is string {
  if (typeof v !== "string" || !DATE_RE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const parts = (date: string) => date.split("-").map(Number) as [number, number, number];
const fmt = (dt: Date) => dt.toISOString().slice(0, 10);

export function addDays(date: string, days: number): string {
  const [y, m, d] = parts(date);
  return fmt(new Date(Date.UTC(y, m - 1, d + days)));
}

export function addMonths(date: string, months: number): string {
  const [y, m] = parts(date);
  return fmt(new Date(Date.UTC(y, m - 1 + months, 1)));
}

export function daysBetween(start: string, end: string): number {
  const [y1, m1, d1] = parts(start);
  const [y2, m2, d2] = parts(end);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** Dia de hoje no fuso. */
export function todayIn(tz: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const startOfMonth = (date: string) => `${date.slice(0, 7)}-01`;
const startOfQuarter = (date: string) => {
  const [y, m] = parts(date);
  return `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
};

/** Período relativo → [início, fim] inclusivos, no fuso. */
export function resolvePreset(preset: PeriodPreset, tz: string, now: Date = new Date()): [string, string] {
  const today = todayIn(tz, now);
  switch (preset) {
    case "today":
      return [today, today];
    case "yesterday":
      return [addDays(today, -1), addDays(today, -1)];
    case "last_7_days":
      return [addDays(today, -6), today];
    case "last_30_days":
      return [addDays(today, -29), today];
    case "this_month":
      return [startOfMonth(today), today];
    case "last_month": {
      const start = addMonths(today, -1);
      return [start, addDays(startOfMonth(today), -1)];
    }
    case "this_quarter":
      return [startOfQuarter(today), today];
    case "last_quarter": {
      const start = addMonths(startOfQuarter(today), -3);
      return [start, addDays(startOfQuarter(today), -1)];
    }
    case "this_year":
      return [`${today.slice(0, 4)}-01-01`, today];
    case "last_12_months":
      return [addMonths(today, -11), today];
  }
}

/** Último dia do bucket que começa em `start` (detalhar uma barra de "set/2026"). */
export function bucketEnd(start: string, granularity: Granularity): string {
  switch (granularity) {
    case "day":
      return start;
    case "week":
      return addDays(start, 6);
    case "month":
      return addDays(addMonths(start, 1), -1);
    case "quarter":
      return addDays(addMonths(start, 3), -1);
    case "year":
      return addDays(addMonths(start, 12), -1);
  }
}

/** Valida `[início, fim]` e o tamanho máximo do período. */
export function checkRange(range: [string, string], maxDays?: number): void {
  const [start, end] = range;
  if (!isCalendarDate(start) || !isCalendarDate(end)) {
    throw new QueryError("invalid-date", "O período usa datas no formato AAAA-MM-DD.");
  }
  if (start > end) {
    throw new QueryError("invalid-date-range", "O início do período precisa ser antes do fim.");
  }
  if (maxDays !== undefined && daysBetween(start, end) + 1 > maxDays) {
    throw new QueryError("period-too-long", `Este tema aceita no máximo ${maxDays} dias de período.`);
  }
}

// ---------------------------------------------------------------------------
// Hora local → instante (para os envios agendados)
// ---------------------------------------------------------------------------

/** Deslocamento (ms) do fuso em relação a UTC no instante informado. */
function offsetMs(instant: Date, tz: string): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(p.find((x) => x.type === type)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - instant.getTime();
}

/** `date` às `hour`:00 no fuso, como instante. */
export function zonedTime(date: string, hour: number, tz: string): Date {
  const [y, m, d] = parts(date);
  const guess = Date.UTC(y, m - 1, d, hour);
  // Duas passadas cobrem a troca de horário de verão.
  const first = guess - offsetMs(new Date(guess), tz);
  return new Date(guess - offsetMs(new Date(first), tz));
}

/** Dia da semana de uma data: 1 = segunda ... 7 = domingo. */
export function isoWeekday(date: string): number {
  const [y, m, d] = parts(date);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}
