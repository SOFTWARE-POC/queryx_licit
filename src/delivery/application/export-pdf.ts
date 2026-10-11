import PDFDocument from "pdfkit";
import { displayValue, ExportTable, headerOf } from "./export";

const MARGIN = 36;
const FONT = 8;
const PAD_X = 4;
const PAD_Y = 3;
const MIN_COL = 42;
const BRAND = "#3B6FC9";
const ZEBRA = "#F4F6F9";
const MUTED = "#6B7280";
const INK = "#111827";

const isNumeric = (t: ExportTable, c: string) => t.annotation[c]?.type === "number" && !t.annotation[c]?.labels;

/** Data e hora no fuso, para o rodapé. */
function stamp(tz: string, now: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: tz, dateStyle: "short", timeStyle: "short" }).format(now);
}

/** Larguras pelo conteúdo (até 200 linhas), cabendo na página; texto longo quebra linha. */
function columnWidths(doc: PDFKit.PDFDocument, table: ExportTable, cells: string[][], available: number): number[] {
  doc.font("Helvetica").fontSize(FONT);
  const natural = table.columns.map((c, i) => {
    doc.font("Helvetica-Bold");
    let w = doc.widthOfString(headerOf(table.annotation[c], c));
    doc.font("Helvetica");
    for (const row of cells.slice(0, 200)) w = Math.max(w, doc.widthOfString(row[i]));
    return Math.min(w, 220) + PAD_X * 2;
  });
  const total = natural.reduce((a, b) => a + b, 0);
  if (total <= available) {
    // Sobra espaço: distribui proporcionalmente para a tabela ocupar a largura.
    return natural.map((w) => (w / total) * available);
  }
  const widths = natural.map((w) => Math.max(MIN_COL, (w / total) * available));
  const scale = available / widths.reduce((a, b) => a + b, 0);
  return widths.map((w) => w * scale);
}

function rowHeight(doc: PDFKit.PDFDocument, values: string[], widths: number[], bold: boolean): number {
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(FONT);
  const h = Math.max(...values.map((v, i) => doc.heightOfString(v || " ", { width: widths[i] - PAD_X * 2 })));
  return h + PAD_Y * 2;
}

function drawRow(
  doc: PDFKit.PDFDocument,
  values: string[],
  widths: number[],
  y: number,
  height: number,
  opts: { fill?: string; color: string; bold: boolean; right: boolean[] },
) {
  const x0 = doc.page.margins.left;
  if (opts.fill) {
    doc.rect(x0, y, widths.reduce((a, b) => a + b, 0), height).fill(opts.fill);
  }
  doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(FONT).fillColor(opts.color);
  let x = x0;
  values.forEach((v, i) => {
    doc.text(v, x + PAD_X, y + PAD_Y, {
      width: widths[i] - PAD_X * 2,
      align: opts.right[i] ? "right" : "left",
      lineBreak: true,
    });
    x += widths[i];
  });
}

/**
 * PDF para imprimir ou anexar: uma seção por tabela (o painel começa cada
 * relatório numa página), cabeçalho repetido a cada página e rodapé com a
 * página e quando foi gerado. Paisagem quando há muitas colunas.
 */
export function toPdf(tables: ExportTable[], tz: string, now = new Date()): Promise<Buffer> {
  const landscape = tables.some((t) => t.columns.length > 5);
  const doc = new PDFDocument({
    size: "A4",
    layout: landscape ? "landscape" : "portrait",
    margins: { top: MARGIN, bottom: MARGIN + 14, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: { Title: tables[0]?.title ?? "Relatório", Creator: "Licitta Relatórios" },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const available = doc.page.width - MARGIN * 2;

  tables.forEach((table, index) => {
    if (index > 0) doc.addPage();
    doc.font("Helvetica-Bold").fontSize(14).fillColor(INK).text(table.title, MARGIN, MARGIN);
    if (table.subtitle) doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(table.subtitle);
    doc.moveDown(0.6);

    const cells = table.data.map((row) =>
      table.columns.map((c) => displayValue(row[c], table.annotation[c], tz)),
    );
    if (table.columns.length === 0 || cells.length === 0) {
      doc.font("Helvetica").fontSize(10).fillColor(MUTED).text("Sem dados no período.");
      return;
    }

    const widths = columnWidths(doc, table, cells, available);
    const right = table.columns.map((c) => isNumeric(table, c));
    const header = table.columns.map((c) => headerOf(table.annotation[c], c));
    const headerHeight = rowHeight(doc, header, widths, true);
    const drawHeader = (y: number) => {
      drawRow(doc, header, widths, y, headerHeight, { fill: BRAND, color: "#FFFFFF", bold: true, right });
      return y + headerHeight;
    };

    let y = drawHeader(doc.y);
    cells.forEach((values, i) => {
      const h = rowHeight(doc, values, widths, false);
      if (y + h > bottom()) {
        doc.addPage();
        y = drawHeader(MARGIN);
      }
      drawRow(doc, values, widths, y, h, { fill: i % 2 ? ZEBRA : undefined, color: INK, bold: false, right });
      y += h;
    });
    doc.y = y;
  });

  // Rodapé em todas as páginas (sem margem inferior para não criar página nova).
  const range = doc.bufferedPageRange();
  const generated = stamp(tz, now);
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(
        `Licitta Relatórios · gerado em ${generated} · página ${i + 1} de ${range.count}`,
        MARGIN,
        doc.page.height - MARGIN,
        { width: doc.page.width - MARGIN * 2, align: "right", lineBreak: false },
      );
    doc.page.margins.bottom = savedBottom;
  }

  doc.end();
  return done;
}
