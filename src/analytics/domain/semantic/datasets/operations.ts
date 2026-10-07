import { Dataset } from "../../types";
import { hoursBetween, P, person, userJoin } from "../common";
import {
  ACCEPTANCE,
  EXEC_STATUS,
  FENCE_EVENT,
  REVIEW_RESULT,
  SERVICE_ORDER_STATUS,
  YES_NO,
} from "../labels";

const OPEN = `t.status IN ('PENDENTE', 'EM_ANDAMENTO')`;

const DEADLINE = {
  NO_PRAZO: "Em aberto, no prazo",
  ATRASADA: "Em aberto, atrasada",
  CONCLUIDA_NO_PRAZO: "Concluída no prazo",
  CONCLUIDA_COM_ATRASO: "Concluída com atraso",
  CANCELADA: "Cancelada",
};

/** OS: uma linha por ordem de serviço, na situação atual. */
export const serviceOrdersDataset: Dataset = {
  name: "service_orders",
  title: "Ordens de serviço",
  description: "Volume, situação, prazos e conclusão das OS.",
  category: "Operação",
  grain: "uma ordem de serviço (situação atual)",
  icon: "Wrench",
  requires: [P.SERVICE_ORDER_READ],
  source: "public.service_orders t",
  joins: {
    team: { sql: "LEFT JOIN public.teams tm ON tm.id = t.team_id" },
    requester: userJoin("rq", "t.requested_by"),
    evaluator: userJoin("ev", "t.evaluator_id"),
    fence: {
      sql: `LEFT JOIN LATERAL (SELECT count(*) FILTER (WHERE fe.type = 'SAIDA') AS exits
        FROM public.service_order_fence_events fe WHERE fe.service_order_id = t.id) fx ON true`,
    },
    messages: {
      sql: `LEFT JOIN LATERAL (SELECT count(*) FILTER (WHERE m.kind = 'MENSAGEM') AS n
        FROM public.service_order_messages m WHERE m.service_order_id = t.id) mx ON true`,
    },
    people: {
      sql: `LEFT JOIN LATERAL (SELECT count(*) AS n FROM public.service_order_assignees a
        WHERE a.service_order_id = t.id) ax ON true`,
    },
  },
  defaultTimeDimension: "created",
  dimensions: {
    status: { title: "Situação", type: "string", sql: "t.status", labels: SERVICE_ORDER_STATUS },
    deadline: {
      title: "Prazo",
      type: "string",
      description: "Em aberto no prazo ou atrasada; concluída no prazo ou com atraso.",
      sql: `CASE WHEN t.status = 'CANCELADA' THEN 'CANCELADA'
        WHEN t.completed_at IS NOT NULL THEN CASE WHEN t.completed_at <= t.date_prev THEN 'CONCLUIDA_NO_PRAZO' ELSE 'CONCLUIDA_COM_ATRASO' END
        WHEN t.date_prev < now() THEN 'ATRASADA' ELSE 'NO_PRAZO' END`,
      labels: DEADLINE,
    },
    type_service: { title: "Tipo de serviço", type: "string", sql: "t.type_service" },
    team: { title: "Time", type: "string", sql: "coalesce(tm.name, 'Sem time')", key: "t.team_id", joins: ["team"] },
    requester: person("Solicitante", "t.requested_by", "rq.name", "requester"),
    evaluator: person("Avaliador", "t.evaluator_id", "ev.name", "evaluator"),
    has_fence: { title: "Tem cerca", type: "boolean", sql: "(t.fence_lat IS NOT NULL)", labels: YES_NO },
    location: { title: "Local", type: "string", sql: "t.location" },
    description: { title: "Descrição", type: "string", sql: "t.description", groupable: false },
    created: { title: "Abertura", type: "time", sql: "t.created_at" },
    date_init: { title: "Início previsto", type: "time", sql: "t.date_init" },
    date_prev: { title: "Data limite", type: "time", sql: "t.date_prev" },
    completed: { title: "Conclusão", type: "time", sql: "t.completed_at" },
  },
  measures: {
    order_count: { kind: "count", title: "OS", format: "integer" },
    pending_count: { kind: "count", title: "Pendentes", format: "integer", filter: "t.status = 'PENDENTE'" },
    in_progress_count: { kind: "count", title: "Em andamento", format: "integer", filter: "t.status = 'EM_ANDAMENTO'" },
    concluded_count: { kind: "count", title: "Concluídas", format: "integer", filter: "t.status = 'CONCLUIDA'" },
    cancelled_count: { kind: "count", title: "Canceladas", format: "integer", filter: "t.status = 'CANCELADA'" },
    open_count: { kind: "count", title: "Em aberto", format: "integer", filter: OPEN },
    overdue_count: {
      kind: "count",
      title: "Atrasadas",
      format: "integer",
      description: "Em aberto com a data limite vencida.",
      filter: `${OPEN} AND t.date_prev < now()`,
    },
    completed_dated_count: {
      kind: "count",
      title: "Concluídas (com data)",
      format: "integer",
      description: "Concluídas que têm data de conclusão registrada.",
      filter: "t.completed_at IS NOT NULL",
    },
    on_time_count: {
      kind: "count",
      title: "Concluídas no prazo",
      format: "integer",
      filter: "t.completed_at IS NOT NULL AND t.completed_at <= t.date_prev",
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
    on_time_rate: {
      kind: "ratio",
      title: "Cumprimento de prazo",
      description: "Concluídas no prazo ÷ concluídas com data de conclusão.",
      numerator: "on_time_count",
      denominator: "completed_dated_count",
      format: "percent",
    },
    avg_completion_days: {
      kind: "avg",
      title: "Tempo médio até concluir",
      format: "days",
      sql: `extract(epoch FROM (t.completed_at - t.created_at)) / 86400.0`,
      filter: "t.completed_at IS NOT NULL",
    },
    estimated_hours: { kind: "sum", title: "Horas estimadas", format: "hours", sql: "t.estimated_hours" },
    fence_exits: { kind: "sum", title: "Saídas da cerca", format: "integer", sql: "fx.exits", joins: ["fence"] },
    messages: { kind: "sum", title: "Mensagens na conversa", format: "integer", sql: "mx.n", joins: ["messages"] },
    assignee_count: { kind: "sum", title: "Pessoas enviadas", format: "integer", sql: "ax.n", joins: ["people"] },
  },
  records: {
    columns: ["created", "type_service", "status", "deadline", "team", "date_prev", "completed"],
    order: "t.created_at DESC",
    link: { sql: "t.id", kind: "service-order" },
  },
};

/** Envios de OS: uma linha por pessoa que recebeu uma OS (direto ou pelo time). */
export const assignmentsDataset: Dataset = {
  name: "assignments",
  title: "Envios e aceite de OS",
  description: "Quem recebeu OS, quanto aceitou ou recusou e em quanto tempo respondeu.",
  category: "Operação",
  grain: "uma OS enviada a uma pessoa",
  icon: "Send",
  requires: [P.SERVICE_ORDER_READ],
  source: `public.service_order_assignees t
  JOIN public.service_orders o ON o.id = t.service_order_id AND o.company_id = t.company_id`,
  joins: {
    person: userJoin("u", "t.user_id"),
    team: { sql: "LEFT JOIN public.teams tm ON tm.id = t.team_id" },
  },
  defaultTimeDimension: "sent",
  dimensions: {
    person: person("Pessoa", "t.user_id", "u.name", "person"),
    via_team: {
      title: "Recebida por",
      type: "string",
      description: "O time pelo qual a pessoa recebeu a OS, ou 'Direto'.",
      sql: "coalesce(tm.name, 'Direto')",
      key: "t.team_id",
      joins: ["team"],
    },
    acceptance: { title: "Resposta", type: "string", sql: "t.acceptance", labels: ACCEPTANCE },
    type_service: { title: "Tipo de serviço", type: "string", sql: "o.type_service" },
    order_status: { title: "Situação da OS", type: "string", sql: "o.status", labels: SERVICE_ORDER_STATUS },
    decline_reason: { title: "Motivo da recusa", type: "string", sql: "t.decline_reason" },
    sent: { title: "Envio", type: "time", sql: "t.created_at" },
    responded: { title: "Resposta em", type: "time", sql: "t.responded_at", groupable: false },
  },
  measures: {
    sent_count: { kind: "count", title: "Envios", format: "integer" },
    accepted_count: { kind: "count", title: "Aceitas", format: "integer", filter: "t.acceptance = 'ACEITA'" },
    declined_count: { kind: "count", title: "Recusadas", format: "integer", filter: "t.acceptance = 'RECUSADA'" },
    waiting_count: {
      kind: "count",
      title: "Aguardando resposta",
      format: "integer",
      filter: "t.acceptance = 'PENDENTE'",
    },
    responded_count: { kind: "count", title: "Respondidas", format: "integer", filter: "t.acceptance <> 'PENDENTE'" },
    acceptance_rate: {
      kind: "ratio",
      title: "Taxa de aceite",
      numerator: "accepted_count",
      denominator: "responded_count",
      format: "percent",
    },
    decline_rate: {
      kind: "ratio",
      title: "Taxa de recusa",
      numerator: "declined_count",
      denominator: "responded_count",
      format: "percent",
    },
    avg_response_minutes: {
      kind: "avg",
      title: "Tempo médio de resposta",
      format: "minutes",
      sql: "extract(epoch FROM (t.responded_at - t.created_at)) / 60.0",
      filter: "t.acceptance <> 'PENDENTE' AND t.responded_at IS NOT NULL",
    },
    people_count: { kind: "countDistinct", title: "Pessoas", format: "integer", sql: "t.user_id" },
    order_count: { kind: "countDistinct", title: "OS", format: "integer", sql: "t.service_order_id" },
  },
  records: {
    columns: ["sent", "person", "type_service", "via_team", "acceptance", "responded", "decline_reason"],
    order: "t.created_at DESC",
    link: { sql: "t.service_order_id", kind: "service-order" },
  },
};

/** Execuções enviadas pelo app e a avaliação do gestor. */
export const executionsDataset: Dataset = {
  name: "executions",
  title: "Execuções e avaliações",
  description: "Execuções enviadas pelo app, aprovações, pedidos de ajuste e fotos.",
  category: "Operação",
  grain: "uma execução enviada para avaliação",
  icon: "ClipboardCheck",
  requires: [P.SERVICE_ORDER_READ],
  source: `public.service_execs t
  JOIN public.service_orders o ON o.id = t.service_order_id AND o.company_id = t.company_id`,
  joins: {
    executor: userJoin("u", "t.executed_by"),
    team: { sql: "LEFT JOIN public.teams tm ON tm.id = o.team_id" },
    review: {
      sql: `LEFT JOIN LATERAL (SELECT v.status, v.validated_at, v.validated_by
        FROM public.service_validations v WHERE v.service_exec_id = t.id
        ORDER BY v.validated_at DESC LIMIT 1) rv ON true`,
    },
    reviewer: { sql: "LEFT JOIN public.users rvu ON rvu.id = rv.validated_by", requires: ["review"] },
    photos: {
      sql: `LEFT JOIN LATERAL (SELECT count(*) AS n FROM public.service_order_evidences ph
        WHERE ph.service_exec_id = t.id) phx ON true`,
    },
  },
  defaultTimeDimension: "executed",
  dimensions: {
    executor: person("Executor", "t.executed_by", "u.name", "executor"),
    type_service: { title: "Tipo de serviço", type: "string", sql: "o.type_service" },
    team: { title: "Time da OS", type: "string", sql: "coalesce(tm.name, 'Sem time')", key: "o.team_id", joins: ["team"] },
    result: {
      title: "Resultado",
      type: "string",
      sql: "coalesce(rv.status, 'AGUARDANDO')",
      joins: ["review"],
      labels: REVIEW_RESULT,
    },
    exec_status: { title: "Situação da execução", type: "string", sql: "t.status", labels: EXEC_STATUS },
    reviewer: { ...person("Avaliado por", "rv.validated_by", "rvu.name", "reviewer") },
    executed: { title: "Envio da execução", type: "time", sql: "t.executed_at" },
    reviewed: { title: "Avaliação", type: "time", sql: "rv.validated_at", joins: ["review"] },
  },
  measures: {
    exec_count: { kind: "count", title: "Execuções", format: "integer" },
    approved_count: {
      kind: "count",
      title: "Aprovadas",
      format: "integer",
      filter: "rv.status = 'APROVADO'",
      joins: ["review"],
    },
    rework_count: {
      kind: "count",
      title: "Ajustes pedidos",
      format: "integer",
      filter: "rv.status = 'REPROVADO'",
      joins: ["review"],
    },
    waiting_count: {
      kind: "count",
      title: "Aguardando avaliação",
      format: "integer",
      filter: "rv.status IS NULL",
      joins: ["review"],
    },
    reviewed_count: {
      kind: "count",
      title: "Avaliadas",
      format: "integer",
      filter: "rv.status IS NOT NULL",
      joins: ["review"],
    },
    approval_rate: {
      kind: "ratio",
      title: "Aprovação de primeira",
      description: "Aprovadas ÷ avaliadas.",
      numerator: "approved_count",
      denominator: "reviewed_count",
      format: "percent",
    },
    rework_rate: {
      kind: "ratio",
      title: "Taxa de retrabalho",
      numerator: "rework_count",
      denominator: "reviewed_count",
      format: "percent",
    },
    avg_review_hours: {
      kind: "avg",
      title: "Tempo médio até avaliar",
      format: "hours",
      sql: hoursBetween("t.executed_at", "rv.validated_at"),
      filter: "rv.validated_at IS NOT NULL",
      joins: ["review"],
    },
    photo_count: { kind: "sum", title: "Fotos", format: "integer", sql: "phx.n", joins: ["photos"] },
    avg_photos: { kind: "avg", title: "Fotos por execução", format: "decimal", sql: "phx.n", joins: ["photos"] },
    executor_count: { kind: "countDistinct", title: "Executores", format: "integer", sql: "t.executed_by" },
    order_count: { kind: "countDistinct", title: "OS", format: "integer", sql: "t.service_order_id" },
  },
  records: {
    columns: ["executed", "executor", "type_service", "team", "result", "reviewed", "reviewer"],
    order: "t.executed_at DESC",
    link: { sql: "t.service_order_id", kind: "service-order" },
  },
};

/** Saídas e retornos da cerca da OS detectados pelo app. */
export const fenceEventsDataset: Dataset = {
  name: "fence_events",
  title: "Cerca das OS",
  description: "Saídas do local da OS durante o serviço: quem, onde, a que distância e se o gestor viu.",
  category: "Operação",
  grain: "uma saída ou retorno da cerca",
  icon: "MapPinOff",
  requires: [P.SERVICE_ORDER_READ],
  source: `public.service_order_fence_events t
  JOIN public.service_orders o ON o.id = t.service_order_id AND o.company_id = t.company_id`,
  joins: {
    person: userJoin("u", "t.user_id"),
    team: { sql: "LEFT JOIN public.teams tm ON tm.id = o.team_id" },
  },
  defaultTimeDimension: "occurred",
  dimensions: {
    person: person("Pessoa", "t.user_id", "u.name", "person"),
    event_type: { title: "Evento", type: "string", sql: "t.type", labels: FENCE_EVENT },
    type_service: { title: "Tipo de serviço", type: "string", sql: "o.type_service" },
    team: { title: "Time da OS", type: "string", sql: "coalesce(tm.name, 'Sem time')", key: "o.team_id", joins: ["team"] },
    place: { title: "Local da OS", type: "string", sql: "coalesce(o.fence_address, o.location)" },
    acknowledged: {
      title: "Visto pelo gestor",
      type: "boolean",
      sql: "(t.acknowledged_at IS NOT NULL)",
      labels: YES_NO,
    },
    distance: { title: "Distância do centro", type: "number", sql: "t.distance_m", format: "meters", groupable: false },
    occurred: { title: "Quando", type: "time", sql: "t.occurred_at" },
  },
  measures: {
    event_count: { kind: "count", title: "Eventos", format: "integer" },
    exit_count: { kind: "count", title: "Saídas", format: "integer", filter: "t.type = 'SAIDA'" },
    return_count: { kind: "count", title: "Retornos", format: "integer", filter: "t.type = 'RETORNO'" },
    unseen_exit_count: {
      kind: "count",
      title: "Saídas não vistas",
      format: "integer",
      filter: "t.type = 'SAIDA' AND t.acknowledged_at IS NULL",
    },
    people_count: {
      kind: "countDistinct",
      title: "Pessoas que saíram",
      format: "integer",
      sql: "t.user_id",
      filter: "t.type = 'SAIDA'",
    },
    order_count: {
      kind: "countDistinct",
      title: "OS com saída",
      format: "integer",
      sql: "t.service_order_id",
      filter: "t.type = 'SAIDA'",
    },
    avg_distance: {
      kind: "avg",
      title: "Distância média na saída",
      format: "meters",
      sql: "t.distance_m",
      filter: "t.type = 'SAIDA'",
    },
    max_distance: {
      kind: "max",
      title: "Maior distância",
      format: "meters",
      sql: "t.distance_m",
      filter: "t.type = 'SAIDA'",
    },
  },
  records: {
    columns: ["occurred", "person", "event_type", "type_service", "place", "distance", "acknowledged"],
    order: "t.occurred_at DESC",
    link: { sql: "t.service_order_id", kind: "service-order" },
  },
};

/** POPs aplicados nas OS. */
export const popUsageDataset: Dataset = {
  name: "pop_usage",
  title: "Uso de POPs",
  description: "Quais procedimentos (POPs) são aplicados nas OS e quanto delas foi concluído.",
  category: "Operação",
  grain: "um POP vinculado a uma OS",
  icon: "BookOpen",
  requires: [P.SERVICE_ORDER_READ, P.POPS_READ],
  source: `public.service_order_pops t
  JOIN public.pops p ON p.id = t.pop_id AND p.company_id = t.company_id
  JOIN public.service_orders o ON o.id = t.service_order_id AND o.company_id = t.company_id`,
  defaultTimeDimension: "created",
  dimensions: {
    pop: { title: "POP", type: "string", sql: "p.titulo", key: "p.id" },
    sector: { title: "Setor", type: "string", sql: "p.setor" },
    type_service: { title: "Tipo de serviço", type: "string", sql: "o.type_service" },
    order_status: { title: "Situação da OS", type: "string", sql: "o.status", labels: SERVICE_ORDER_STATUS },
    created: { title: "Abertura da OS", type: "time", sql: "o.created_at" },
  },
  measures: {
    order_count: { kind: "countDistinct", title: "OS", format: "integer", sql: "t.service_order_id" },
    concluded_count: {
      kind: "countDistinct",
      title: "OS concluídas",
      format: "integer",
      sql: "t.service_order_id",
      filter: "o.status = 'CONCLUIDA'",
    },
    completion_rate: {
      kind: "ratio",
      title: "Taxa de conclusão",
      numerator: "concluded_count",
      denominator: "order_count",
      format: "percent",
    },
    pop_count: { kind: "countDistinct", title: "POPs", format: "integer", sql: "t.pop_id" },
  },
  records: {
    columns: ["created", "pop", "sector", "type_service", "order_status"],
    order: "o.created_at DESC",
    link: { sql: "t.service_order_id", kind: "service-order" },
  },
};
