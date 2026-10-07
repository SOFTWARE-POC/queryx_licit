import { QueryError } from "../types";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Deslocamento (ms) do fuso em relação a UTC no instante informado. */
function offsetMs(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - instant.getTime();
}

/** Meia-noite local de `YYYY-MM-DD` no fuso, como instante UTC. */
function zonedMidnight(date: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  // Duas passadas cobrem a troca de horário de verão perto da meia-noite.
  const first = guess - offsetMs(new Date(guess), tz);
  return new Date(guess - offsetMs(new Date(first), tz));
}

function addDaysToDateString(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

/** Instante de um valor: `YYYY-MM-DD` = meia-noite local no fuso; ISO = como veio. */
export function toInstant(value: string, tz: string): Date {
  const date = DATE_ONLY.test(value) ? zonedMidnight(value, tz) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new QueryError("invalid-date", `Data inválida: '${value}'.`);
  }
  return date;
}

/**
 * Converte `[início, fim]` em `{ $gte, $lt }` (intervalo semiaberto).
 * Datas `YYYY-MM-DD` são dias locais do fuso: `["2026-09-01", "2026-09-30"]`
 * cobre setembro inteiro no horário de Brasília, não em UTC.
 */
export function toInstantRange(
  range: [string, string],
  tz: string,
  padDays = 0,
): { $gte: Date; $lt: Date } {
  const [start, end] = range;
  const startStr = DATE_ONLY.test(start) ? addDaysToDateString(start, -padDays) : start;
  const endStr = DATE_ONLY.test(end) ? addDaysToDateString(end, 1 + padDays) : end;
  let gte = toInstant(startStr, tz);
  let lt = toInstant(endStr, tz);
  if (!DATE_ONLY.test(start) && padDays) gte = new Date(gte.getTime() - padDays * 86_400_000);
  if (!DATE_ONLY.test(end) && padDays) lt = new Date(lt.getTime() + padDays * 86_400_000);
  if (gte.getTime() >= lt.getTime()) {
    throw new QueryError("invalid-date-range", "O início do período precisa ser antes do fim.");
  }
  return { $gte: gte, $lt: lt };
}
