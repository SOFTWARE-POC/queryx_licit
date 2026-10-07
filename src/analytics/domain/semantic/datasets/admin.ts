import { Dataset } from "../../types";
import { P } from "../common";
import { ACCESS_EVENT, AUDIT_ACTION, AUDIT_ENTITY, CONTRACT_STATUS, LICIT_STATUS } from "../labels";

export const auditDataset: Dataset = {
  name: "audit",
  title: "Alterações no sistema",
  description: "Quem criou, alterou ou excluiu OS, contratos, licitações, usuários, perfis e permissões.",
  category: "Conformidade",
  grain: "uma alteração registrada na auditoria",
  icon: "History",
  requires: [P.AUDIT_READ],
  source: "public.audit_log t",
  defaultTimeDimension: "created",
  dimensions: {
    entity: { title: "O que mudou", type: "string", sql: "t.entity", labels: AUDIT_ENTITY },
    action: { title: "Ação", type: "string", sql: "t.action", labels: AUDIT_ACTION },
    actor: { title: "Quem fez", type: "string", sql: "coalesce(t.actor_name, 'Sistema')", key: "t.actor_id", pii: true },
    entity_id: { title: "Registro", type: "string", sql: "t.entity_id", groupable: false },
    created: { title: "Quando", type: "time", sql: "t.created_at" },
  },
  measures: {
    change_count: { kind: "count", title: "Alterações", format: "integer" },
    create_count: { kind: "count", title: "Criações", format: "integer", filter: "t.action = 'CREATE'" },
    update_count: { kind: "count", title: "Edições", format: "integer", filter: "t.action = 'UPDATE'" },
    delete_count: { kind: "count", title: "Exclusões", format: "integer", filter: "t.action = 'DELETE'" },
    actor_count: { kind: "countDistinct", title: "Pessoas", format: "integer", sql: "t.actor_id" },
    record_count: {
      kind: "countDistinct",
      title: "Registros alterados",
      format: "integer",
      sql: "(t.entity || ':' || t.entity_id)",
    },
  },
  records: { columns: ["created", "actor", "entity", "action", "entity_id"], order: "t.created_at DESC" },
};

export const accessDataset: Dataset = {
  name: "access",
  title: "Acessos",
  description: "Logins, falhas de login, saídas e sessões revogadas (LGPD art. 37).",
  category: "Conformidade",
  grain: "um evento de acesso",
  icon: "LogIn",
  requires: [P.AUDIT_READ],
  source: "public.access_logs t",
  joins: { person: { sql: "LEFT JOIN public.users u ON u.id = t.user_id" } },
  defaultTimeDimension: "created",
  dimensions: {
    event: { title: "Evento", type: "string", sql: "t.event", labels: ACCESS_EVENT },
    person: {
      title: "Pessoa",
      type: "string",
      sql: "coalesce(u.name, 'Não identificado')",
      key: "t.user_id",
      joins: ["person"],
      pii: true,
    },
    ip: { title: "IP", type: "string", sql: "t.ip", groupable: false },
    created: { title: "Quando", type: "time", sql: "t.created_at" },
  },
  measures: {
    event_count: { kind: "count", title: "Eventos", format: "integer" },
    login_count: {
      kind: "count",
      title: "Logins",
      format: "integer",
      filter: "t.event IN ('LOGIN_OK', 'FACE_LOGIN_OK')",
    },
    failure_count: {
      kind: "count",
      title: "Logins recusados",
      format: "integer",
      filter: "t.event IN ('LOGIN_FAIL', 'FACE_LOGIN_FAIL')",
    },
    attempt_count: {
      kind: "count",
      title: "Tentativas de login",
      format: "integer",
      filter: "t.event IN ('LOGIN_OK', 'FACE_LOGIN_OK', 'LOGIN_FAIL', 'FACE_LOGIN_FAIL')",
    },
    failure_rate: {
      kind: "ratio",
      title: "Taxa de falha de login",
      numerator: "failure_count",
      denominator: "attempt_count",
      format: "percent",
    },
    face_login_count: { kind: "count", title: "Logins faciais", format: "integer", filter: "t.event = 'FACE_LOGIN_OK'" },
    people_count: {
      kind: "countDistinct",
      title: "Pessoas que entraram",
      format: "integer",
      sql: "t.user_id",
      filter: "t.event IN ('LOGIN_OK', 'FACE_LOGIN_OK')",
    },
  },
  records: { columns: ["created", "person", "event", "ip"], order: "t.created_at DESC" },
};

const VALIDITY = {
  VIGENTE: "Vigente",
  VENCENDO: "Vence em até 90 dias",
  VENCIDO: "Ativo, mas vencido",
  INATIVO: "Inativo",
};

export const contractsDataset: Dataset = {
  name: "contracts",
  title: "Contratos",
  description: "Carteira de contratos: órgão, modalidade, vigência e valor.",
  category: "Contratos",
  grain: "um contrato",
  icon: "FileText",
  requires: [P.CONTRACT_READ],
  source: `public.contracts t
  JOIN public.licits l ON l.id = t.licit_id AND l.company_id = t.company_id`,
  defaultTimeDimension: "start",
  dimensions: {
    number: { title: "Contrato", type: "string", sql: "t.num_contract", key: "t.id" },
    org: { title: "Órgão", type: "string", sql: "l.org" },
    modality: { title: "Modalidade", type: "string", sql: "l.modality" },
    licit: { title: "Licitação", type: "string", sql: "l.number_licit", key: "l.id" },
    status: { title: "Situação", type: "string", sql: "t.status", labels: CONTRACT_STATUS },
    validity: {
      title: "Vigência",
      type: "string",
      sql: `CASE WHEN t.status <> 'ACTIVE' THEN 'INATIVO'
        WHEN t.date_end < now() THEN 'VENCIDO'
        WHEN t.date_end < now() + interval '90 days' THEN 'VENCENDO'
        ELSE 'VIGENTE' END`,
      labels: VALIDITY,
    },
    value: { title: "Valor", type: "number", sql: "t.price_contract", format: "currency", groupable: false },
    start: { title: "Início", type: "time", sql: "t.date_init" },
    end: { title: "Término", type: "time", sql: "t.date_end" },
  },
  measures: {
    contract_count: { kind: "count", title: "Contratos", format: "integer" },
    active_count: { kind: "count", title: "Ativos", format: "integer", filter: "t.status = 'ACTIVE'" },
    total_value: { kind: "sum", title: "Valor total", format: "currency", sql: "t.price_contract" },
    active_value: {
      kind: "sum",
      title: "Valor ativo",
      format: "currency",
      sql: "t.price_contract",
      filter: "t.status = 'ACTIVE'",
    },
    avg_value: { kind: "avg", title: "Valor médio", format: "currency", sql: "t.price_contract" },
    expiring_count: {
      kind: "count",
      title: "Vencem em 90 dias",
      format: "integer",
      filter: "t.status = 'ACTIVE' AND t.date_end >= now() AND t.date_end < now() + interval '90 days'",
    },
    expired_active_count: {
      kind: "count",
      title: "Ativos vencidos",
      format: "integer",
      filter: "t.status = 'ACTIVE' AND t.date_end < now()",
    },
  },
  records: {
    columns: ["number", "org", "modality", "status", "validity", "start", "end", "value"],
    order: "t.date_end ASC",
  },
};

export const licitsDataset: Dataset = {
  name: "licits",
  title: "Licitações",
  description: "Licitações por órgão e modalidade, valor estimado e o que virou contrato.",
  category: "Contratos",
  grain: "uma licitação",
  icon: "Scroll",
  requires: [P.LICIT_READ],
  source: "public.licits t",
  joins: {
    contracts: {
      sql: `LEFT JOIN LATERAL (SELECT count(*) AS n, coalesce(sum(c.price_contract), 0) AS total
        FROM public.contracts c WHERE c.licit_id = t.id AND c.company_id = t.company_id) cx ON true`,
    },
  },
  defaultTimeDimension: "created",
  dimensions: {
    number: { title: "Licitação", type: "string", sql: "t.number_licit", key: "t.id" },
    org: { title: "Órgão", type: "string", sql: "t.org" },
    modality: { title: "Modalidade", type: "string", sql: "t.modality" },
    status: { title: "Situação", type: "string", sql: "t.status", labels: LICIT_STATUS },
    value: { title: "Valor estimado", type: "number", sql: "t.value_estim", format: "currency", groupable: false },
    created: { title: "Cadastro", type: "time", sql: "t.created_at" },
  },
  measures: {
    licit_count: { kind: "count", title: "Licitações", format: "integer" },
    open_count: { kind: "count", title: "Abertas", format: "integer", filter: "t.status = 'OPEN'" },
    finished_count: { kind: "count", title: "Finalizadas", format: "integer", filter: "t.status = 'FINISH'" },
    total_estimated: { kind: "sum", title: "Valor estimado", format: "currency", sql: "t.value_estim" },
    avg_estimated: { kind: "avg", title: "Valor estimado médio", format: "currency", sql: "t.value_estim" },
    contract_count: { kind: "sum", title: "Contratos gerados", format: "integer", sql: "cx.n", joins: ["contracts"] },
    contracted_value: {
      kind: "sum",
      title: "Valor contratado",
      format: "currency",
      sql: "cx.total",
      joins: ["contracts"],
    },
  },
  records: { columns: ["created", "number", "org", "modality", "status", "value"], order: "t.created_at DESC" },
};
