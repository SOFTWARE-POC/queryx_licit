/** Recorte de período. Datas `YYYY-MM-DD` = dias locais (o backend interpreta no fuso). */
export type PeriodKey = "month" | "last-month" | "30d" | "90d" | "year" | "custom";

export interface Period {
  key: PeriodKey;
  range: [string, string];
}

export const PERIOD_OPTIONS: Array<{ key: PeriodKey; label: string }> = [
  { key: "month", label: "Este mês" },
  { key: "last-month", label: "Mês anterior" },
  { key: "30d", label: "Últimos 30 dias" },
  { key: "90d", label: "Últimos 90 dias" },
  { key: "year", label: "Este ano" },
  { key: "custom", label: "Personalizado" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function presetRange(key: Exclude<PeriodKey, "custom">, today = new Date()): [string, string] {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (key) {
    case "month":
      return [ymd(new Date(y, m, 1)), ymd(today)];
    case "last-month":
      return [ymd(new Date(y, m - 1, 1)), ymd(new Date(y, m, 0))];
    case "30d":
      return [ymd(new Date(y, m, today.getDate() - 29)), ymd(today)];
    case "90d":
      return [ymd(new Date(y, m, today.getDate() - 89)), ymd(today)];
    case "year":
      return [ymd(new Date(y, 0, 1)), ymd(today)];
  }
}

export function defaultPeriod(): Period {
  return { key: "month", range: presetRange("month") };
}

export function dayCount([start, end]: [string, string]): number {
  return Math.round((parseYmd(end).getTime() - parseYmd(start).getTime()) / 86_400_000) + 1;
}

/** Período de mesmo tamanho imediatamente anterior (base das variações). */
export function previousRange(range: [string, string]): [string, string] {
  const days = dayCount(range);
  const start = parseYmd(range[0]);
  const prevEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1);
  const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), prevEnd.getDate() - days + 1);
  return [ymd(prevStart), ymd(prevEnd)];
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function periodLabel(p: Period): string {
  if (p.key !== "custom") return PERIOD_OPTIONS.find((o) => o.key === p.key)!.label;
  const [a, b] = p.range.map(parseYmd);
  const f = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== b.getFullYear() ? ` ${d.getFullYear()}` : ""}`;
  return `${f(a)} – ${f(b)} ${b.getFullYear()}`;
}

/** Granularidade da série temporal conforme o tamanho do período. */
export function trendGranularity(range: [string, string]): "day" | "week" | "month" {
  const days = dayCount(range);
  return days <= 45 ? "day" : days <= 200 ? "week" : "month";
}
