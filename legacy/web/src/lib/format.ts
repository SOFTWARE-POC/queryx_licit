import type { Column, ValueFormat } from "./types";

let TZ = "America/Sao_Paulo";
export function setTimezone(tz: string) {
  TZ = tz;
}

const nf = (opts: Intl.NumberFormatOptions) => new Intl.NumberFormat("pt-BR", opts);
const INT = nf({ maximumFractionDigits: 0 });
const DEC = nf({ maximumFractionDigits: 2 });
const PCT = nf({ minimumFractionDigits: 1, maximumFractionDigits: 1 });
const BRL = nf({ style: "currency", currency: "BRL" });

function dateFmt(opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, ...opts });
}

/** Horas decimais → "185:30" (padrão de espelho de ponto). */
export function hhmm(hours: number): string {
  const total = Math.round(hours * 60);
  const sign = total < 0 ? "−" : "";
  const abs = Math.abs(total);
  return `${sign}${INT.format(Math.floor(abs / 60))}:${String(abs % 60).padStart(2, "0")}`;
}

/** Máscara LGPD: "Ana Paula Souza" → "A. S." */
export function maskName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (!parts[0]) return name;
  return `${parts[0][0]}. ${parts.length > 1 ? `${parts[parts.length - 1][0]}.` : ""}`.trim();
}

export function formatValue(value: unknown, format: ValueFormat | null, compact = false): string {
  if (value === null || value === undefined || value === "") return "—";
  if (format === "date" || format === "datetime" || format === "time") {
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) return String(value);
    if (format === "date") return dateFmt({ day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
    if (format === "time") return dateFmt({ hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
    return dateFmt({ day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  switch (format) {
    case "integer":
      return INT.format(n);
    case "percent":
      return `${PCT.format(n * 100)}%`;
    case "currency":
      if (compact && Math.abs(n) >= 1_000_000) return `R$ ${DEC.format(n / 1_000_000)} mi`;
      if (compact && Math.abs(n) >= 10_000) return `R$ ${DEC.format(n / 1_000)} mil`;
      return BRL.format(n);
    case "hours":
      // Compacto (KPIs, eixos): "1.691h"; abaixo de 10h, "8:17".
      return compact && (Math.abs(n) >= 10 || n === 0) ? `${INT.format(Math.round(n))}h` : hhmm(n);
    default:
      return DEC.format(n);
  }
}

/** Valor de uma célula: rótulo de enum, máscara de nome, formato. */
export function formatCell(value: unknown, col: Column | undefined, maskPii: boolean): string {
  if (!col) return value === null || value === undefined ? "—" : String(value);
  if (col.labels && typeof value === "string") return col.labels[value] ?? value;
  if (col.pii && maskPii && typeof value === "string") return maskName(value);
  if (col.type === "string") return value === null || value === undefined || value === "" ? "—" : String(value);
  return formatValue(value, col.format ?? (col.type === "time" ? "date" : null));
}

/** Medidas em que subir é ruim (a variação fica vermelha). */
const LOWER_IS_BETTER = new Set([
  "overdue_count", "overdue_rate", "overtime_hours", "overtime_days", "changed_count",
  "change_rate", "adjusted_count", "invalidated_count", "cancelled_count", "pending_count",
]);

export function delta(
  measure: string,
  format: ValueFormat | null,
  current: unknown,
  previous: unknown,
): { text: string; tone: "good" | "bad" | "neutral" } | null {
  const a = Number(current);
  const b = Number(previous);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  let text: string;
  let diff: number;
  if (format === "percent") {
    diff = (a - b) * 100;
    if (Math.abs(diff) < 0.05) return { text: "estável", tone: "neutral" };
    text = `${diff > 0 ? "+" : "−"}${PCT.format(Math.abs(diff))} p.p.`;
  } else {
    if (b === 0) return a === 0 ? { text: "estável", tone: "neutral" } : null;
    diff = ((a - b) / Math.abs(b)) * 100;
    if (Math.abs(diff) < 0.05) return { text: "estável", tone: "neutral" };
    text = `${diff > 0 ? "+" : "−"}${PCT.format(Math.abs(diff))}%`;
  }
  const up = diff > 0;
  const good = LOWER_IS_BETTER.has(measure) ? !up : up;
  return { text, tone: good ? "good" : "bad" };
}

/** CSV no padrão do Excel em português (";" e BOM UTF-8). */
export function toCsv(rows: Array<Record<string, unknown>>, columns: string[], ann: Record<string, Column>, maskPii: boolean): string {
  const esc = (s: string) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const head = columns.map((c) => esc(ann[c]?.title ?? c)).join(";");
  const body = rows.map((r) =>
    columns
      .map((c) => {
        const col = ann[c];
        const v = r[c];
        if (col?.type === "number" && typeof v === "number" && col.format !== "hours") {
          return esc(col.format === "percent" ? String(v * 100).replace(".", ",") : String(v).replace(".", ","));
        }
        return esc(col ? formatCell(v, col, maskPii) : String(v ?? ""));
      })
      .join(";"),
  );
  return "\uFEFF" + [head, ...body].join("\r\n");
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Rótulo curto de um bucket de tempo (eixo de gráfico). */
export function bucketLabel(value: unknown, granularity: string): string {
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value ?? "");
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "2-digit" })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  if (granularity === "month") return `${MONTHS[Number(parts.month) - 1]}/${parts.year}`;
  if (granularity === "week") return `sem ${parts.day}/${parts.month}`;
  return `${parts.day}/${parts.month}`;
}
