import { Dataset } from "../../types";
import { TIME_ENTRY_SOURCE, TIME_ENTRY_STATUS, TIME_ENTRY_TYPE } from "../labels";
import { userName } from "../lookups";

const CHANGED = { $in: ["$status", ["ADJUSTED", "INVALIDATED"]] };

/**
 * Marcações de ponto (collection `timeentries`, model `TimeEntry`).
 * GRÃO: uma marcação (entrada ou saída), incluindo ajustadas e invalidadas —
 * é a base de auditoria.
 */
export const timeEntriesDataset: Dataset = {
  name: "time_entries",
  title: "Marcações de ponto",
  description: "Cada entrada e saída registrada, com origem e trilha de ajustes.",
  collection: "timeentries",
  grain: "uma marcação de ponto",
  tenantField: "company",
  defaultTimeDimension: "timestamp",

  dimensions: {
    employee: { title: "Funcionário", type: "string", expr: "__user.name", pii: true, lookup: userName("user", "__user") },
    employee_id: { title: "Funcionário (id)", type: "id", expr: "user" },
    type: { title: "Tipo", type: "string", expr: "type", labels: TIME_ENTRY_TYPE },
    source: { title: "Origem", type: "string", expr: "source", labels: TIME_ENTRY_SOURCE },
    status: { title: "Situação", type: "string", expr: "status", labels: TIME_ENTRY_STATUS },
    timestamp: { title: "Marcação", type: "time", expr: "timestamp", format: "datetime" },
    original_timestamp: {
      title: "Horário original",
      type: "time",
      expr: "original_timestamp",
      format: "datetime",
    },
    adjusted_by: {
      title: "Ajustado por",
      type: "string",
      expr: "__adjuster.name",
      pii: true,
      lookup: userName("adjusted_by", "__adjuster"),
    },
    adjusted_reason: { title: "Justificativa", type: "string", expr: "adjusted_reason" },
  },

  measures: {
    entry_count: { kind: "count", title: "Marcações", format: "integer" },
    clock_in_count: {
      kind: "count",
      title: "Entradas",
      format: "integer",
      filter: { $eq: ["$type", "CLOCK_IN"] },
    },
    clock_out_count: {
      kind: "count",
      title: "Saídas",
      format: "integer",
      filter: { $eq: ["$type", "CLOCK_OUT"] },
    },
    adjusted_count: {
      kind: "count",
      title: "Ajustadas",
      format: "integer",
      filter: { $eq: ["$status", "ADJUSTED"] },
    },
    invalidated_count: {
      kind: "count",
      title: "Invalidadas",
      format: "integer",
      filter: { $eq: ["$status", "INVALIDATED"] },
    },
    changed_count: { kind: "count", title: "Ajustadas ou invalidadas", format: "integer", filter: CHANGED },
    face_count: {
      kind: "count",
      title: "Por reconhecimento facial",
      format: "integer",
      filter: { $eq: ["$source", "FACE"] },
    },
    employee_count: { kind: "countDistinct", title: "Funcionários", field: "user", format: "integer" },
    change_rate: {
      kind: "ratio",
      title: "Taxa de ajuste",
      numerator: "changed_count",
      denominator: "entry_count",
      format: "percent",
    },
  },
};
