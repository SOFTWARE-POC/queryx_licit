import { ColumnAnnotation, Dataset, Granularity, QuerySpec } from "../types";
import { resolveMeasure, timeKey } from "./group";

const GRANULARITY_LABEL: Record<Granularity, string> = {
  day: "dia",
  week: "semana",
  month: "mês",
  quarter: "trimestre",
  year: "ano",
};

/** Tipo e formato de cada coluna de saída — o frontend renderiza sem conhecer o domínio. */
export function buildAnnotation(spec: QuerySpec, ds: Dataset): Record<string, ColumnAnnotation> {
  const ann: Record<string, ColumnAnnotation> = {};

  for (const dn of spec.dimensions ?? []) {
    const dim = ds.dimensions[dn];
    ann[dn] = {
      title: dim.title,
      type: dim.type === "number" ? "number" : dim.type === "time" ? "time" : "string",
      format: dim.format ?? null,
      ...(dim.pii ? { pii: true } : {}),
      ...(dim.labels ? { labels: dim.labels } : {}),
    };
  }

  const t = spec.timeDimension;
  if (t?.granularity) {
    const dim = ds.dimensions[t.dimension];
    ann[timeKey(t.dimension, t.granularity)] = {
      title: `${dim.title} (${GRANULARITY_LABEL[t.granularity]})`,
      type: "time",
      format: "date",
    };
  }

  for (const name of spec.measures) {
    const m = resolveMeasure(ds, name);
    ann[name] = {
      title: m.title,
      type: m.valueType ?? "number",
      format: m.format ?? (m.kind === "ratio" ? "percent" : "number"),
    };
  }

  return ann;
}
