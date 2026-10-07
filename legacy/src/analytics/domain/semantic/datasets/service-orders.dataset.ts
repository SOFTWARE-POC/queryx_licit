import { Dataset } from "../../types";
import { SERVICE_ORDER_STATUS } from "../labels";

const OPEN = ["PENDENTE", "EM_ANDAMENTO"];

/**
 * Ordens de serviço (collection `serviceorders`, model `ServiceOrder`).
 * GRÃO: uma OS, no estado atual.
 *
 * Não há data de conclusão no schema, então "cumprimento de prazo" das
 * concluídas não é calculável; o que dá pra medir é atraso das OS em aberto
 * (prazo vencido e ainda não concluídas).
 */
export const serviceOrdersDataset: Dataset = {
  name: "service_orders",
  title: "Ordens de serviço",
  description: "Volume, conclusão e atraso das ordens de serviço.",
  collection: "serviceorders",
  grain: "uma ordem de serviço (estado atual)",
  tenantField: "company",
  defaultTimeDimension: "date_init",

  dimensions: {
    status: { title: "Situação", type: "string", expr: "status", labels: SERVICE_ORDER_STATUS },
    type_service: { title: "Tipo de serviço", type: "string", expr: "type_service" },
    contract_id: { title: "Contrato (id)", type: "id", expr: "contract_id" },
    contract: {
      title: "Contrato",
      type: "string",
      expr: "__contract.num_contract",
      lookup: {
        from: "contracts",
        localField: "contract_id",
        foreignField: "_id",
        as: "__contract",
        fields: ["num_contract"],
        late: true,
      },
    },
    date_init: { title: "Início previsto", type: "time", expr: "date_init", format: "date" },
    date_prev: { title: "Prazo", type: "time", expr: "date_prev", format: "date" },
    created: { title: "Abertura", type: "time", expr: "createdAt", format: "date" },
  },

  measures: {
    order_count: { kind: "count", title: "Ordens de serviço", format: "integer" },
    pending_count: {
      kind: "count",
      title: "Pendentes",
      format: "integer",
      filter: { $eq: ["$status", "PENDENTE"] },
    },
    in_progress_count: {
      kind: "count",
      title: "Em andamento",
      format: "integer",
      filter: { $eq: ["$status", "EM_ANDAMENTO"] },
    },
    concluded_count: {
      kind: "count",
      title: "Concluídas",
      format: "integer",
      filter: { $eq: ["$status", "CONCLUIDA"] },
    },
    cancelled_count: {
      kind: "count",
      title: "Canceladas",
      format: "integer",
      filter: { $eq: ["$status", "CANCELADA"] },
    },
    open_count: {
      kind: "count",
      title: "Em aberto",
      format: "integer",
      filter: { $in: ["$status", OPEN] },
    },
    overdue_count: {
      kind: "count",
      title: "Em atraso",
      format: "integer",
      description: "Em aberto com o prazo já vencido.",
      filter: { $and: [{ $in: ["$status", OPEN] }, { $lt: ["$date_prev", "$$NOW"] }] },
    },
    completion_rate: {
      kind: "ratio",
      title: "Taxa de conclusão",
      numerator: "concluded_count",
      denominator: "order_count",
      format: "percent",
    },
    overdue_rate: {
      kind: "ratio",
      title: "Atraso entre as abertas",
      numerator: "overdue_count",
      denominator: "open_count",
      format: "percent",
    },
  },
};
