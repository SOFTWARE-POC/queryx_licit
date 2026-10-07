import { isPeriodPreset, PeriodPreset } from "../../analytics/domain/period";
import { isObject } from "../../analytics/domain/validation";
import { Author, Visualization, VISUALIZATIONS } from "./report";

export const WIDGET_SIZES = ["sm", "md", "lg", "full"] as const;
export type WidgetSize = (typeof WIDGET_SIZES)[number];
export const MAX_WIDGETS = 24;

export interface Widget {
  /** Id local do item no painel (o front gera). */
  id: string;
  reportId: string;
  /** Título próprio no painel (padrão: nome do relatório). */
  title?: string;
  /** Visualização própria no painel (padrão: a do relatório). */
  visualization?: Visualization;
  /** sm = 1/3, md = 1/2, lg = 2/3, full = linha inteira. */
  size: WidgetSize;
}

export interface DashboardDefinition {
  id: string;
  system: boolean;
  name: string;
  description: string;
  /** Período ao abrir; vale para todos os itens que usam período. */
  defaultPeriod: PeriodPreset;
  widgets: Widget[];
  createdBy?: Author | null;
  updatedBy?: Author | null;
  updatedAt?: string;
}

export interface DashboardInput {
  name: string;
  description: string;
  defaultPeriod: PeriodPreset;
  widgets: Widget[];
}

const WIDGET_ID = /^[A-Za-z0-9_-]{1,40}$/;
const REPORT_ID = /^(sys-[a-z0-9-]{1,40}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function validateDashboardInput(body: unknown): { errors: string[]; input?: DashboardInput } {
  const errors: string[] = [];
  if (!isObject(body)) return { errors: ["O painel precisa ser um objeto JSON."] };
  for (const key of Object.keys(body)) {
    if (!["name", "description", "defaultPeriod", "widgets"].includes(key)) errors.push(`Campo desconhecido: '${key}'.`);
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 2 || name.length > 120) errors.push("O nome precisa ter de 2 a 120 caracteres.");
  const description = body.description === undefined ? "" : typeof body.description === "string" ? body.description.trim() : null;
  if (description === null || description.length > 500) errors.push("A descrição aceita até 500 caracteres.");
  const period = body.defaultPeriod ?? "last_30_days";
  if (!isPeriodPreset(period)) errors.push("Período padrão inválido.");

  const widgets: Widget[] = [];
  if (!Array.isArray(body.widgets) || body.widgets.length > MAX_WIDGETS) {
    errors.push(`O painel aceita até ${MAX_WIDGETS} itens.`);
  } else {
    const ids = new Set<string>();
    body.widgets.forEach((w, i) => {
      if (!isObject(w)) {
        errors.push(`Item ${i + 1}: inválido.`);
        return;
      }
      for (const key of Object.keys(w)) {
        if (!["id", "reportId", "title", "visualization", "size"].includes(key)) errors.push(`Item ${i + 1}: campo '${key}'.`);
      }
      if (typeof w.id !== "string" || !WIDGET_ID.test(w.id) || ids.has(w.id)) errors.push(`Item ${i + 1}: id inválido.`);
      else ids.add(w.id);
      if (typeof w.reportId !== "string" || !REPORT_ID.test(w.reportId)) errors.push(`Item ${i + 1}: relatório inválido.`);
      if (w.title !== undefined && (typeof w.title !== "string" || w.title.trim().length > 120)) {
        errors.push(`Item ${i + 1}: título até 120 caracteres.`);
      }
      if (w.visualization !== undefined && !VISUALIZATIONS.includes(w.visualization as never)) {
        errors.push(`Item ${i + 1}: visualização inválida.`);
      }
      if (!WIDGET_SIZES.includes(w.size as never)) errors.push(`Item ${i + 1}: tamanho inválido.`);
      widgets.push({
        id: String(w.id),
        reportId: String(w.reportId),
        ...(typeof w.title === "string" && w.title.trim() ? { title: w.title.trim() } : {}),
        ...(w.visualization ? { visualization: w.visualization as Visualization } : {}),
        size: w.size as WidgetSize,
      });
    });
  }
  if (errors.length) return { errors };
  return {
    errors: [],
    input: { name, description: description ?? "", defaultPeriod: period as PeriodPreset, widgets },
  };
}
