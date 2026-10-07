import { Dataset } from "../../types";
import { CONTRACT_STATUS, LICIT_STATUS } from "../labels";

/** Decimal128 (dinheiro no schema) → double, pra somar/médias saírem como número. */
const money = (field: string) => ({ $toDouble: `$${field}` });

const ACTIVE = { $eq: ["$status", "ACTIVE"] };

/**
 * Contratos (collection `contracts`). GRÃO: um contrato.
 * Tenant em `company_id` e licitação em `licit_id` (nomes do schema real).
 */
export const contractsDataset: Dataset = {
  name: "contracts",
  title: "Contratos",
  description: "Carteira de contratos, valores e vencimentos.",
  collection: "contracts",
  grain: "um contrato",
  tenantField: "company_id",
  defaultTimeDimension: "date_init",

  dimensions: {
    contract_id: { title: "Contrato (id)", type: "id", expr: "_id" },
    contract_number: { title: "Contrato", type: "string", expr: "num_contract" },
    status: { title: "Situação", type: "string", expr: "status", labels: CONTRACT_STATUS },
    date_init: { title: "Início", type: "time", expr: "date_init", format: "date" },
    date_end: { title: "Término", type: "time", expr: "date_end", format: "date" },
    licit: {
      title: "Licitação",
      type: "string",
      expr: "__licit.number_licit",
      lookup: {
        from: "licits",
        localField: "licit_id",
        foreignField: "_id",
        as: "__licit",
        fields: ["number_licit", "org"],
      },
    },
    org: {
      title: "Órgão",
      type: "string",
      expr: "__licit.org",
      lookup: {
        from: "licits",
        localField: "licit_id",
        foreignField: "_id",
        as: "__licit",
        fields: ["number_licit", "org"],
      },
    },
  },

  measures: {
    contract_count: { kind: "count", title: "Contratos", format: "integer" },
    active_count: { kind: "count", title: "Ativos", format: "integer", filter: ACTIVE },
    expiring_count: {
      kind: "count",
      title: "Vencem em 90 dias",
      format: "integer",
      filter: {
        $and: [
          ACTIVE,
          { $gte: ["$date_end", "$$NOW"] },
          { $lte: ["$date_end", { $dateAdd: { startDate: "$$NOW", unit: "day", amount: 90 } }] },
        ],
      },
    },
    total_value: { kind: "sum", title: "Valor total", expr: money("price_contract"), format: "currency" },
    active_value: {
      kind: "sum",
      title: "Valor dos ativos",
      expr: money("price_contract"),
      filter: ACTIVE,
      format: "currency",
    },
    avg_value: { kind: "avg", title: "Valor médio", expr: money("price_contract"), format: "currency" },
  },
};

/**
 * Licitações (collection `licits`). GRÃO: uma licitação.
 * O schema não tem timestamps nem datas — não há dimensão de tempo.
 */
export const licitsDataset: Dataset = {
  name: "licits",
  title: "Licitações",
  description: "Licitações por modalidade, órgão e situação.",
  collection: "licits",
  grain: "uma licitação",
  tenantField: "company_id",

  dimensions: {
    number: { title: "Licitação", type: "string", expr: "number_licit" },
    status: { title: "Situação", type: "string", expr: "status", labels: LICIT_STATUS },
    modality: { title: "Modalidade", type: "string", expr: "modality" },
    org: { title: "Órgão", type: "string", expr: "org" },
  },

  measures: {
    licit_count: { kind: "count", title: "Licitações", format: "integer" },
    open_count: {
      kind: "count",
      title: "Abertas",
      format: "integer",
      filter: { $eq: ["$status", "OPEN"] },
    },
    finished_count: {
      kind: "count",
      title: "Finalizadas",
      format: "integer",
      filter: { $eq: ["$status", "FINISH"] },
    },
    total_estimated: {
      kind: "sum",
      title: "Valor estimado",
      expr: { $toDouble: "$value_estim" },
      format: "currency",
    },
  },
};
