import ExcelJS from "exceljs";
import { ColumnAnnotation, Granularity } from "../../analytics/domain/types";

/** Uma tabela para exportar (um relatório; um painel vira várias). */
export interface ExportTable {
  title: string;
  subtitle?: string;
  columns: string[];
  annotation: Record<string, ColumnAnnotation>;
  data: Array<Record<string, unknown>>;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const dmy = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

export function bucketLabel(date: string, granularity: Granularity | undefined): string {
  const [y, m] = [date.slice(0, 4), Number(date.slice(5, 7))];
  switch (granularity) {
    case "week":
      return `Semana de ${dmy(date)}`;
    case "month":
      return `${MONTHS[m - 1]}/${y}`;
    case "quarter":
      return `${Math.floor((m - 1) / 3) + 1}º tri/${y}`;
    case "year":
      return y;
    default:
      return dmy(date);
  }
}

/** Partes de data/hora de um instante no fuso. */
function localParts(iso: string, tz: string) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t: string) => p.find((x) => x.type === t)!.value;
  return { y: get("year"), mo: get("month"), d: get("day"), h: get("hour"), mi: get("minute") };
}

/** Texto de uma célula (CSV, corpo do e-mail). */
export function displayValue(value: unknown, ann: ColumnAnnotation | undefined, tz: string): string {
  if (value === null || value === undefined) return "";
  if (ann?.labels && ann.labels[String(value)] !== undefined) return ann.labels[String(value)];
  if (ann?.role === "bucket") return bucketLabel(String(value), ann.granularity);
  if (ann?.type === "boolean") return value ? "Sim" : "Não";
  if (ann?.type === "date") return dmy(String(value));
  if (ann?.type === "time") {
    const { y, mo, d, h, mi } = localParts(String(value), tz);
    if (ann.format === "time") return `${h}:${mi}`;
    if (ann.format === "date") return `${d}/${mo}/${y}`;
    return `${d}/${mo}/${y} ${h}:${mi}`;
  }
  if (typeof value === "number") {
    const nf = (digits: number) =>
      value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    switch (ann?.format) {
      case "percent":
        return `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
      case "currency":
        return `R$ ${nf(2)}`;
      case "hours":
      case "days":
      case "decimal":
        return nf(1);
      case "integer":
      case "minutes":
      case "meters":
        return Math.round(value).toLocaleString("pt-BR");
      default:
        return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    }
  }
  return String(value);
}

const UNIT: Partial<Record<string, string>> = { hours: " (h)", minutes: " (min)", days: " (dias)", meters: " (m)" };
const headerOf = (ann: ColumnAnnotation | undefined, key: string) => `${ann?.title ?? key}${UNIT[ann?.format ?? ""] ?? ""}`;

/** CSV para Excel em português: `;`, vírgula decimal e BOM UTF-8. */
export function toCsv(table: ExportTable, tz: string): Buffer {
  const esc = (s: string) => (/[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [table.columns.map((c) => esc(headerOf(table.annotation[c], c))).join(";")];
  for (const row of table.data) {
    lines.push(
      table.columns
        .map((c) => {
          const ann = table.annotation[c];
          const v = row[c];
          // Números sem símbolo/milhar: o Excel lê como número.
          if (typeof v === "number" && !ann?.labels) {
            const n = ann?.format === "percent" ? v * 100 : v;
            return String(Math.round(n * 10000) / 10000).replace(".", ",");
          }
          return esc(displayValue(v, ann, tz));
        })
        .join(";"),
    );
  }
  return Buffer.from(`﻿${lines.join("\r\n")}\r\n`, "utf8");
}

const NUM_FMT: Partial<Record<string, string>> = {
  integer: "#,##0",
  percent: "0.0%",
  currency: '"R$" #,##0.00',
  hours: "#,##0.0",
  days: "#,##0.0",
  decimal: "#,##0.0",
  minutes: "#,##0",
  meters: "#,##0",
  number: "#,##0.##",
};

function sheetName(title: string, used: Set<string>): string {
  const base = title.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 28) || "Planilha";
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 26)} ${i}`;
  used.add(name.toLowerCase());
  return name;
}

/** XLSX com uma aba por tabela: título, período, cabeçalho fixo e números de verdade. */
export async function toXlsx(tables: ExportTable[], tz: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Licitta Relatórios";
  wb.created = new Date();
  const used = new Set<string>();

  for (const table of tables) {
    const ws = wb.addWorksheet(sheetName(table.title, used));
    ws.addRow([table.title]).font = { bold: true, size: 13 };
    if (table.subtitle) ws.addRow([table.subtitle]).font = { color: { argb: "FF6B7280" } };
    ws.addRow([]);
    const header = ws.addRow(table.columns.map((c) => headerOf(table.annotation[c], c)));
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3B6FC9" } };
    });
    ws.views = [{ state: "frozen", ySplit: header.number }];

    for (const row of table.data) {
      const values = table.columns.map((c) => {
        const ann = table.annotation[c];
        const v = row[c];
        if (v === null || v === undefined) return null;
        if (ann?.labels || ann?.role === "bucket" || ann?.type === "boolean") return displayValue(v, ann, tz);
        if (ann?.type === "date") {
          const s = String(v);
          return new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))));
        }
        if (ann?.type === "time") {
          // Excel não tem fuso: grava a hora local como se fosse UTC.
          const { y, mo, d, h, mi } = localParts(String(v), tz);
          return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)));
        }
        return v;
      });
      ws.addRow(values);
    }

    table.columns.forEach((c, i) => {
      const ann = table.annotation[c];
      const col = ws.getColumn(i + 1);
      if (ann?.type === "date") col.numFmt = "dd/mm/yyyy";
      else if (ann?.type === "time") col.numFmt = ann.format === "time" ? "hh:mm" : ann.format === "date" ? "dd/mm/yyyy" : "dd/mm/yyyy hh:mm";
      else if (ann?.type === "number" && !ann.labels) col.numFmt = NUM_FMT[ann.format ?? "number"] ?? "#,##0.##";
      const longest = Math.max(
        headerOf(ann, c).length,
        ...table.data.slice(0, 200).map((r) => displayValue(r[c], ann, tz).length),
      );
      col.width = Math.min(Math.max(longest + 2, 10), 60);
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Nome de arquivo seguro: "Frequência e jornada" → "frequencia-e-jornada". */
export function fileSlug(title: string): string {
  return (
    title
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "relatorio"
  );
}
