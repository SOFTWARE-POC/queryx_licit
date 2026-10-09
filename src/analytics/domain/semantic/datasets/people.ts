import { Dataset, SourceParams } from "../../types";
import { alertedSql, CatalogOptions, hoursBetween, P, person, userJoin, WEEKDAY_SQL } from "../common";
import {
  ABSENCE_STATUS,
  ABSENCE_TYPE,
  ATTENDANCE,
  FENCE_EVENT,
  YES_NO,
  PRESENCE,
  TIME_ENTRY_SOURCE,
  TIME_ENTRY_STATUS,
  TIME_ENTRY_TYPE,
  WEEKDAY,
} from "../labels";

/**
 * Jornadas: um dia trabalhado de uma pessoa, derivado das marcações.
 * Cada entrada é pareada com a marcação seguinte da mesma pessoa, se for uma
 * saída em até 24h. Turno que cruza a meia-noite conta no dia em que começou.
 * Marcações invalidadas ficam de fora; as ajustadas entram com o horário novo.
 */
export function workDaysDataset(opts: CatalogOptions): Dataset {
  const std = (opts.standardWorkdayMinutes / 60).toFixed(4);
  return {
    name: "work_days",
    title: "Jornadas",
    description: "Dias trabalhados, horas, média diária e horas acima da jornada, a partir do ponto.",
    category: "Pessoas",
    grain: "um dia trabalhado de uma pessoa",
    icon: "Clock",
    requires: [P.TIMECLOCK_READ],
    source: (p: SourceParams) => `(
      SELECT d.company_id, d.user_id, (d.in_at AT TIME ZONE ${p.tz})::date AS day,
             min(d.in_at) AS first_in, max(d.out_at) AS last_out, count(*)::int AS sessions,
             sum(extract(epoch FROM (d.out_at - d.in_at))) / 3600.0 AS hours
        FROM (SELECT e.company_id, e.user_id, e.type, e.timestamp AS in_at,
                     lead(e.type) OVER w AS next_type, lead(e.timestamp) OVER w AS out_at
                FROM public.time_entries e
               WHERE e.company_id = ${p.tenant} AND e.status <> 'INVALIDATED'
               ${
                 // Folga de 1 dia antes e 2 depois: pareia turnos que cruzam a meia-noite.
                 p.start && p.end
                   ? `AND e.timestamp >= ((${p.start} - 1)::timestamp AT TIME ZONE ${p.tz})
                      AND e.timestamp < ((${p.end} + 2)::timestamp AT TIME ZONE ${p.tz})`
                   : ""
               }
              WINDOW w AS (PARTITION BY e.user_id ORDER BY e.timestamp)) d
       WHERE d.type = 'CLOCK_IN' AND d.next_type = 'CLOCK_OUT' AND d.out_at - d.in_at <= interval '24 hours'
       GROUP BY 1, 2, 3
    ) t`,
    joins: { person: userJoin("u", "t.user_id") },
    defaultTimeDimension: "day",
    dimensions: {
      person: person("Pessoa", "t.user_id", "u.name", "person"),
      day: { title: "Dia", type: "date", sql: "t.day" },
      weekday: { title: "Dia da semana", type: "string", sql: WEEKDAY_SQL("t.day"), labels: WEEKDAY },
      first_in: { title: "Primeira entrada", type: "time", sql: "t.first_in", format: "time", groupable: false },
      last_out: { title: "Última saída", type: "time", sql: "t.last_out", format: "time", groupable: false },
      hours: { title: "Horas no dia", type: "number", sql: "t.hours", format: "hours", groupable: false },
      sessions: { title: "Períodos", type: "number", sql: "t.sessions", format: "integer", groupable: false },
    },
    measures: {
      days_worked: { kind: "count", title: "Dias trabalhados", format: "integer" },
      people_count: { kind: "countDistinct", title: "Pessoas", format: "integer", sql: "t.user_id" },
      worked_hours: { kind: "sum", title: "Horas trabalhadas", format: "hours", sql: "t.hours" },
      avg_daily_hours: { kind: "avg", title: "Média por dia", format: "hours", sql: "t.hours" },
      overtime_hours: {
        kind: "sum",
        title: "Horas acima da jornada",
        description: `Acima de ${opts.standardWorkdayMinutes / 60}h no dia.`,
        format: "hours",
        sql: `greatest(t.hours - ${std}, 0)`,
      },
      overtime_days: {
        kind: "count",
        title: "Dias acima da jornada",
        format: "integer",
        filter: `t.hours > ${std}`,
      },
      first_in: { kind: "min", title: "Primeira entrada", format: "time", sql: "t.first_in" },
      last_out: { kind: "max", title: "Última saída", format: "time", sql: "t.last_out" },
      sessions: { kind: "sum", title: "Períodos", format: "integer", sql: "t.sessions" },
    },
    records: {
      columns: ["day", "person", "first_in", "last_out", "sessions", "hours"],
      order: "t.day DESC, u.name",
    },
  };
}

/**
 * Escala x ponto: um dia de escala de uma pessoa, comparado com a primeira
 * entrada e a última saída do turno e com abonos aprovados.
 *
 * Dias de escala vêm de dois jeitos:
 *  - turnos gravados da pessoa (dia da semana), como sempre;
 *  - escala em ciclo (12x36…) para quem não tem turnos próprios: os plantões
 *    saem da data de início + horário + ciclo, a mesma conta do my-shifts da API.
 *
 * Tolerâncias (min): as da escala, senão as da empresa (attendance_settings),
 * senão as padrão do serviço. Um turno só conta depois do início + tolerância;
 * a saída antecipada só depois do fim do turno.
 */
export function attendanceDataset(opts: CatalogOptions): Dataset {
  const lateDefault = Math.trunc(opts.lateToleranceMinutes);
  const earlyDefault = Math.trunc(opts.earlyLeaveToleranceMinutes ?? opts.lateToleranceMinutes);
  return {
    name: "attendance",
    title: "Escala x ponto",
    description: "Presença, faltas, faltas abonadas, atrasos e saídas antecipadas contra a escala de cada pessoa.",
    category: "Pessoas",
    grain: "um dia de escala de uma pessoa",
    icon: "CalendarCheck",
    requires: [P.TIMECLOCK_READ],
    needsPeriod: true,
    source: (p: SourceParams) => `(
      SELECT x.company_id, x.user_id, x.day, x.schedule_name, x.start_time, x.end_time, x.shift_end,
             x.late_tol, x.early_tol, fi.first_in, lo.last_out,
             CASE WHEN fi.first_in IS NOT NULL THEN
               greatest(0, floor(extract(epoch FROM (fi.first_in - x.shift_start)) / 60))::int
             END AS late_minutes,
             CASE WHEN lo.last_out IS NOT NULL AND x.shift_end <= now() THEN
               greatest(0, floor(extract(epoch FROM (x.shift_end - lo.last_out)) / 60))::int
             END AS early_leave_minutes,
             CASE WHEN fi.first_in IS NULL AND ab.id IS NOT NULL THEN 'ABONADA'
                  WHEN fi.first_in IS NULL THEN 'FALTA'
                  WHEN extract(epoch FROM (fi.first_in - x.shift_start)) / 60 > x.late_tol THEN 'ATRASO'
                  ELSE 'PRESENTE' END AS status
        FROM (SELECT DISTINCT ON (r.user_id, r.day) r.*
                FROM (
                  -- Turnos gravados por dia da semana (escala semanal ou exceções da pessoa).
                  SELECT sw.company_id, sw.user_id, g.day::date AS day, sc.name AS schedule_name, sc.start_date,
                         sh.start_time, sh.end_time,
                         (g.day::date + sh.start_time) AT TIME ZONE ${p.tz} AS shift_start,
                         (g.day::date + sh.end_time
                           + CASE WHEN sh.end_time <= sh.start_time THEN interval '1 day' ELSE interval '0' END)
                           AT TIME ZONE ${p.tz} AS shift_end,
                         coalesce(sc.late_tolerance_minutes, st.late_tolerance_minutes, ${lateDefault}) AS late_tol,
                         coalesce(sc.early_leave_tolerance_minutes, st.early_leave_tolerance_minutes, ${earlyDefault}) AS early_tol
                    FROM public.schedule_workers sw
                    JOIN public.schedules sc ON sc.id = sw.schedule_id AND sc.company_id = sw.company_id AND sc.status = 'ACTIVE'
                    LEFT JOIN public.attendance_settings st ON st.company_id = sw.company_id
                    CROSS JOIN generate_series(${p.start}, ${p.end}, interval '1 day') AS g(day)
                    JOIN LATERAL (SELECT min(s.start_time) AS start_time, max(s.end_time) AS end_time
                                    FROM public.schedule_worker_shifts s
                                   WHERE s.schedule_id = sw.schedule_id AND s.user_id = sw.user_id
                                     AND s.day = to_char(g.day, 'FMDAY')) sh ON sh.start_time IS NOT NULL
                   WHERE sw.company_id = ${p.tenant}
                     AND g.day::date >= (sc.start_date AT TIME ZONE ${p.tz})::date
                     AND (sc.end_date IS NULL OR g.day::date <= (sc.end_date AT TIME ZONE ${p.tz})::date)
                  UNION ALL
                  -- Ciclo (12x36…): quem não tem turnos próprios segue os plantões da escala.
                  SELECT sw.company_id, sw.user_id, o.local_start::date AS day, sc.name, sc.start_date,
                         o.local_start::time, (o.local_start + make_interval(hours => sc.cycle_work_hours))::time,
                         o.local_start AT TIME ZONE ${p.tz},
                         (o.local_start + make_interval(hours => sc.cycle_work_hours)) AT TIME ZONE ${p.tz},
                         coalesce(sc.late_tolerance_minutes, st.late_tolerance_minutes, ${lateDefault}),
                         coalesce(sc.early_leave_tolerance_minutes, st.early_leave_tolerance_minutes, ${earlyDefault})
                    FROM public.schedule_workers sw
                    JOIN public.schedules sc ON sc.id = sw.schedule_id AND sc.company_id = sw.company_id AND sc.status = 'ACTIVE'
                     AND sc.pattern_type = 'CYCLE' AND sc.start_time IS NOT NULL
                     AND sc.cycle_work_hours > 0 AND sc.cycle_rest_hours > 0
                    LEFT JOIN public.attendance_settings st ON st.company_id = sw.company_id
                    CROSS JOIN LATERAL generate_series(
                      (sc.start_date AT TIME ZONE ${p.tz})::date + sc.start_time,
                      ${p.end} + interval '1 day' - interval '1 second',
                      make_interval(hours => sc.cycle_work_hours + sc.cycle_rest_hours)) AS o(local_start)
                   WHERE sw.company_id = ${p.tenant}
                     AND o.local_start::date >= ${p.start}
                     AND (sc.end_date IS NULL OR o.local_start::date <= (sc.end_date AT TIME ZONE ${p.tz})::date)
                     AND NOT EXISTS (SELECT 1 FROM public.schedule_worker_shifts s
                                      WHERE s.schedule_id = sw.schedule_id AND s.user_id = sw.user_id)
                ) r
               -- Turno de hoje só conta depois do início + tolerância.
               WHERE r.shift_start + make_interval(mins => r.late_tol) < now()
               ORDER BY r.user_id, r.day, r.start_date DESC) x
        LEFT JOIN LATERAL (SELECT min(e.timestamp) AS first_in FROM public.time_entries e
                            WHERE e.company_id = x.company_id AND e.user_id = x.user_id
                              AND e.type = 'CLOCK_IN' AND e.status <> 'INVALIDATED'
                              AND e.timestamp >= (x.day::timestamp AT TIME ZONE ${p.tz})
                              AND e.timestamp < ((x.day + 1)::timestamp AT TIME ZONE ${p.tz})) fi ON true
        -- Última saída do turno: da entrada (ou do início) até 6 h depois do fim.
        LEFT JOIN LATERAL (SELECT max(e.timestamp) AS last_out FROM public.time_entries e
                            WHERE e.company_id = x.company_id AND e.user_id = x.user_id
                              AND e.type = 'CLOCK_OUT' AND e.status <> 'INVALIDATED'
                              AND e.timestamp > coalesce(fi.first_in, x.shift_start)
                              AND e.timestamp <= x.shift_end + interval '6 hours') lo ON true
        LEFT JOIN LATERAL (SELECT a.id FROM public.absence_requests a
                            WHERE a.company_id = x.company_id AND a.user_id = x.user_id AND a.status = 'APROVADO'
                              AND x.day BETWEEN a.start_date AND a.end_date LIMIT 1) ab ON true
    ) t`,
    joins: { person: userJoin("u", "t.user_id") },
    defaultTimeDimension: "day",
    dimensions: {
      person: person("Pessoa", "t.user_id", "u.name", "person"),
      day: { title: "Dia", type: "date", sql: "t.day" },
      weekday: { title: "Dia da semana", type: "string", sql: WEEKDAY_SQL("t.day"), labels: WEEKDAY },
      status: { title: "Situação no dia", type: "string", sql: "t.status", labels: ATTENDANCE },
      schedule: { title: "Escala", type: "string", sql: "t.schedule_name" },
      shift_start: {
        title: "Início do turno",
        type: "string",
        sql: "to_char(t.start_time, 'HH24:MI')",
        groupable: false,
      },
      first_in: { title: "Entrada", type: "time", sql: "t.first_in", format: "time", groupable: false },
      late_minutes: { title: "Atraso", type: "number", sql: "t.late_minutes", format: "minutes", groupable: false },
      shift_end: {
        title: "Fim do turno",
        type: "string",
        sql: "to_char(t.end_time, 'HH24:MI')",
        groupable: false,
      },
      last_out: { title: "Saída", type: "time", sql: "t.last_out", format: "time", groupable: false },
      early_leave_minutes: {
        title: "Saída antecipada",
        type: "number",
        sql: "t.early_leave_minutes",
        format: "minutes",
        groupable: false,
      },
      early_leave: {
        title: "Saiu antes do fim",
        type: "boolean",
        sql: "coalesce(t.early_leave_minutes > t.early_tol, false)",
        labels: YES_NO,
      },
    },
    measures: {
      scheduled_days: { kind: "count", title: "Dias de escala", format: "integer" },
      present_days: {
        kind: "count",
        title: "Dias presentes",
        format: "integer",
        filter: "t.status IN ('PRESENTE', 'ATRASO')",
      },
      on_time_days: { kind: "count", title: "Dias no horário", format: "integer", filter: "t.status = 'PRESENTE'" },
      late_days: { kind: "count", title: "Dias com atraso", format: "integer", filter: "t.status = 'ATRASO'" },
      absent_days: { kind: "count", title: "Faltas", format: "integer", filter: "t.status = 'FALTA'" },
      excused_days: { kind: "count", title: "Faltas abonadas", format: "integer", filter: "t.status = 'ABONADA'" },
      late_minutes: {
        kind: "sum",
        title: "Minutos de atraso",
        format: "minutes",
        sql: "t.late_minutes",
        filter: "t.status = 'ATRASO'",
      },
      early_leave_days: {
        kind: "count",
        title: "Dias com saída antecipada",
        format: "integer",
        filter: "t.early_leave_minutes > t.early_tol",
      },
      early_leave_minutes: {
        kind: "sum",
        title: "Minutos de saída antecipada",
        format: "minutes",
        sql: "t.early_leave_minutes",
        filter: "t.early_leave_minutes > t.early_tol",
      },
      attendance_rate: {
        kind: "ratio",
        title: "Assiduidade",
        description: "Dias presentes ÷ dias de escala.",
        numerator: "present_days",
        denominator: "scheduled_days",
        format: "percent",
      },
      absence_rate: {
        kind: "ratio",
        title: "Taxa de faltas",
        numerator: "absent_days",
        denominator: "scheduled_days",
        format: "percent",
      },
      punctuality_rate: {
        kind: "ratio",
        title: "Pontualidade",
        description: "Dias no horário ÷ dias presentes.",
        numerator: "on_time_days",
        denominator: "present_days",
        format: "percent",
      },
      people_count: { kind: "countDistinct", title: "Pessoas", format: "integer", sql: "t.user_id" },
    },
    records: {
      columns: ["day", "person", "schedule", "shift_start", "first_in", "status", "late_minutes", "shift_end", "last_out", "early_leave_minutes"],
      order: "t.day DESC, u.name",
    },
  };
}

export const timeEntriesDataset: Dataset = {
  name: "time_entries",
  title: "Marcações de ponto",
  description: "Cada batida de ponto: origem, ajustes e invalidações, com autor e justificativa.",
  category: "Conformidade",
  grain: "uma marcação de ponto",
  icon: "Fingerprint",
  requires: [P.TIMECLOCK_READ],
  source: "public.time_entries t",
  joins: {
    person: userJoin("u", "t.user_id"),
    adjuster: userJoin("adj", "t.adjusted_by"),
    site: { sql: "LEFT JOIN public.work_sites ws ON ws.id = t.work_site_id" },
  },
  defaultTimeDimension: "timestamp",
  dimensions: {
    person: person("Pessoa", "t.user_id", "u.name", "person"),
    type: { title: "Tipo", type: "string", sql: "t.type", labels: TIME_ENTRY_TYPE },
    source: { title: "Origem", type: "string", sql: "t.source", labels: TIME_ENTRY_SOURCE },
    status: { title: "Situação", type: "string", sql: "t.status", labels: TIME_ENTRY_STATUS },
    adjusted_by: person("Ajustada por", "t.adjusted_by", "adj.name", "adjuster"),
    reason: { title: "Justificativa", type: "string", sql: "t.adjusted_reason" },
    offline: {
      title: "Conexão",
      type: "boolean",
      sql: "t.offline",
      labels: { true: "Feita sem internet", false: "Online" },
    },
    timestamp: { title: "Data e hora", type: "time", sql: "t.timestamp" },
    received: { title: "Recebida em", type: "time", sql: "t.created_at" },
    site: {
      title: "Local de ponto conferido",
      type: "string",
      sql: "coalesce(ws.name, 'Sem local')",
      key: "t.work_site_id",
      joins: ["site"],
    },
    site_check: {
      title: "Batida no local",
      type: "string",
      sql: "CASE WHEN t.work_site_distance_m IS NULL THEN 'NO_CHECK' WHEN t.work_site_distance_m = 0 THEN 'INSIDE' ELSE 'OUTSIDE' END",
      labels: { INSIDE: "Dentro do local", OUTSIDE: "Fora do local", NO_CHECK: "Sem conferência" },
    },
    site_distance: {
      title: "Fora do local (m)",
      type: "number",
      sql: "t.work_site_distance_m",
      format: "meters",
      groupable: false,
    },
    coordinates: {
      title: "Coordenadas",
      type: "string",
      sql: "CASE WHEN t.latitude IS NULL THEN NULL ELSE round(t.latitude::numeric, 6) || ', ' || round(t.longitude::numeric, 6) END",
      groupable: false,
    },
    original: { title: "Horário original", type: "time", sql: "t.original_timestamp" },
  },
  measures: {
    entry_count: { kind: "count", title: "Marcações", format: "integer" },
    offline_count: { kind: "count", title: "Feitas sem internet", format: "integer", filter: "t.offline" },
    located_count: { kind: "count", title: "Com coordenada", format: "integer", filter: "t.latitude IS NOT NULL" },
    outside_site_count: {
      kind: "count",
      title: "Fora do local de ponto",
      format: "integer",
      filter: "t.work_site_distance_m > 0",
    },
    outside_site_rate: {
      kind: "ratio",
      title: "Taxa fora do local",
      numerator: "outside_site_count",
      denominator: "entry_count",
      format: "percent",
    },
    offline_rate: {
      kind: "ratio",
      title: "Taxa sem internet",
      numerator: "offline_count",
      denominator: "entry_count",
      format: "percent",
    },
    clock_in_count: { kind: "count", title: "Entradas", format: "integer", filter: "t.type = 'CLOCK_IN'" },
    clock_out_count: { kind: "count", title: "Saídas", format: "integer", filter: "t.type = 'CLOCK_OUT'" },
    adjusted_count: { kind: "count", title: "Ajustadas", format: "integer", filter: "t.status = 'ADJUSTED'" },
    invalidated_count: { kind: "count", title: "Invalidadas", format: "integer", filter: "t.status = 'INVALIDATED'" },
    changed_count: { kind: "count", title: "Alteradas", format: "integer", filter: "t.status <> 'VALID'" },
    change_rate: {
      kind: "ratio",
      title: "Taxa de alteração",
      numerator: "changed_count",
      denominator: "entry_count",
      format: "percent",
    },
    face_count: { kind: "count", title: "Por reconhecimento facial", format: "integer", filter: "t.source = 'FACE'" },
    face_rate: {
      kind: "ratio",
      title: "Uso do facial",
      numerator: "face_count",
      denominator: "entry_count",
      format: "percent",
    },
    avg_face_confidence: {
      kind: "avg",
      title: "Confiança média do facial",
      format: "percent",
      sql: "t.face_confidence",
      filter: "t.source = 'FACE'",
    },
    people_count: { kind: "countDistinct", title: "Pessoas", format: "integer", sql: "t.user_id" },
  },
  records: {
    columns: ["timestamp", "person", "type", "source", "offline", "site", "site_check", "site_distance", "coordinates", "status", "original", "adjusted_by", "reason"],
    order: "t.timestamp DESC",
  },
};

/** Saídas do local de ponto detectadas pelo app durante a jornada. */
export const siteFenceEventsDataset: Dataset = {
  name: "site_fence_events",
  title: "Cerca do local de ponto",
  description:
    "Saídas e retornos do local de ponto durante a jornada: quem, de onde, quanto fora do perímetro, se o gestor foi avisado e se viu.",
  category: "Pessoas",
  grain: "uma saída ou retorno do local de ponto",
  icon: "MapPinOff",
  requires: [P.TIMECLOCK_READ],
  source: `public.work_site_fence_events t
  JOIN public.work_sites s ON s.id = t.site_id AND s.company_id = t.company_id`,
  joins: { person: userJoin("u", "t.user_id") },
  defaultTimeDimension: "occurred",
  dimensions: {
    person: person("Pessoa", "t.user_id", "u.name", "person"),
    event_type: { title: "Evento", type: "string", sql: "t.type", labels: FENCE_EVENT },
    site: { title: "Local de ponto", type: "string", sql: "s.name", key: "t.site_id" },
    shape: {
      title: "Perímetro",
      type: "string",
      sql: "CASE WHEN s.polygon IS NULL THEN 'CIRCLE' ELSE 'POLYGON' END",
      labels: { CIRCLE: "Círculo", POLYGON: "Polígono" },
    },
    alerted: {
      title: "Gestor avisado (e-mail/WhatsApp)",
      type: "boolean",
      sql: alertedSql("WORK_SITE"),
      labels: YES_NO,
    },
    acknowledged: {
      title: "Visto pelo gestor",
      type: "boolean",
      sql: "(t.acknowledged_at IS NOT NULL)",
      labels: YES_NO,
    },
    distance: { title: "Fora do perímetro", type: "number", sql: "t.distance_m", format: "meters", groupable: false },
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
    alerted_exit_count: {
      kind: "count",
      title: "Saídas avisadas por e-mail/WhatsApp",
      format: "integer",
      filter: `t.type = 'SAIDA' AND ${alertedSql("WORK_SITE")}`,
    },
    alert_rate: {
      kind: "ratio",
      title: "Saídas avisadas",
      numerator: "alerted_exit_count",
      denominator: "exit_count",
      format: "percent",
    },
    people_count: {
      kind: "countDistinct",
      title: "Pessoas que saíram",
      format: "integer",
      sql: "t.user_id",
      filter: "t.type = 'SAIDA'",
    },
    site_count: {
      kind: "countDistinct",
      title: "Locais com saída",
      format: "integer",
      sql: "t.site_id",
      filter: "t.type = 'SAIDA'",
    },
    avg_distance: {
      kind: "avg",
      title: "Média fora do perímetro",
      format: "meters",
      sql: "t.distance_m",
      filter: "t.type = 'SAIDA'",
    },
    max_distance: {
      kind: "max",
      title: "Maior distância fora",
      format: "meters",
      sql: "t.distance_m",
      filter: "t.type = 'SAIDA'",
    },
  },
  records: {
    columns: ["occurred", "person", "event_type", "site", "distance", "alerted", "acknowledged"],
    order: "t.occurred_at DESC",
  },
};

export const clockAttemptsDataset: Dataset = {
  name: "clock_attempts",
  title: "Tentativas de ponto",
  description: "Toda tentativa de bater o ponto, aceita ou recusada, com o motivo da recusa.",
  category: "Conformidade",
  grain: "uma tentativa de bater o ponto",
  icon: "ShieldAlert",
  requires: [P.TIMECLOCK_READ],
  source: "public.time_clock_attempts t",
  joins: { person: userJoin("u", "t.user_id") },
  defaultTimeDimension: "created",
  dimensions: {
    person: person("Pessoa", "t.user_id", "u.name", "person"),
    type: { title: "Tipo", type: "string", sql: "t.type", labels: TIME_ENTRY_TYPE },
    accepted: { title: "Resultado", type: "boolean", sql: "t.accepted", labels: { true: "Aceita", false: "Recusada" } },
    reason: { title: "Motivo da recusa", type: "string", sql: "t.error" },
    created: { title: "Quando", type: "time", sql: "t.created_at" },
  },
  measures: {
    attempt_count: { kind: "count", title: "Tentativas", format: "integer" },
    refused_count: { kind: "count", title: "Recusadas", format: "integer", filter: "NOT t.accepted" },
    refused_rate: {
      kind: "ratio",
      title: "Taxa de recusa",
      numerator: "refused_count",
      denominator: "attempt_count",
      format: "percent",
    },
    people_count: { kind: "countDistinct", title: "Pessoas", format: "integer", sql: "t.user_id" },
  },
  records: { columns: ["created", "person", "type", "accepted", "reason"], order: "t.created_at DESC" },
};

export const absencesDataset: Dataset = {
  name: "absences",
  title: "Ausências e abonos",
  description: "Pedidos de abono (atestados, justificativas, ausências programadas) e a decisão do gestor.",
  category: "Pessoas",
  grain: "um pedido de abono",
  icon: "CalendarX2",
  requires: [P.ABSENCE_READ],
  source: "public.absence_requests t",
  joins: { person: userJoin("u", "t.user_id"), reviewer: userJoin("rvw", "t.reviewed_by") },
  defaultTimeDimension: "start",
  dimensions: {
    person: person("Pessoa", "t.user_id", "u.name", "person"),
    type: { title: "Tipo", type: "string", sql: "t.type", labels: ABSENCE_TYPE },
    status: { title: "Situação", type: "string", sql: "t.status", labels: ABSENCE_STATUS },
    partial: {
      title: "Duração",
      type: "boolean",
      sql: "(t.start_time IS NOT NULL)",
      labels: { true: "Parcial (horas)", false: "Dia inteiro" },
    },
    reviewer: person("Decidido por", "t.reviewed_by", "rvw.name", "reviewer"),
    reason: { title: "Motivo", type: "string", sql: "t.reason", groupable: false },
    start: { title: "Início", type: "date", sql: "t.start_date" },
    end: { title: "Fim", type: "date", sql: "t.end_date", groupable: false },
    created: { title: "Pedido em", type: "time", sql: "t.created_at" },
  },
  measures: {
    request_count: { kind: "count", title: "Pedidos", format: "integer" },
    approved_count: { kind: "count", title: "Aprovados", format: "integer", filter: "t.status = 'APROVADO'" },
    rejected_count: { kind: "count", title: "Rejeitados", format: "integer", filter: "t.status = 'REJEITADO'" },
    pending_count: { kind: "count", title: "Pendentes", format: "integer", filter: "t.status = 'PENDENTE'" },
    decided_count: {
      kind: "count",
      title: "Decididos",
      format: "integer",
      filter: "t.status IN ('APROVADO', 'REJEITADO')",
    },
    approval_rate: {
      kind: "ratio",
      title: "Taxa de aprovação",
      numerator: "approved_count",
      denominator: "decided_count",
      format: "percent",
    },
    approved_days: {
      kind: "sum",
      title: "Dias abonados",
      description: "Dias inteiros aprovados (pedidos de horas não entram).",
      format: "days",
      sql: "(t.end_date - t.start_date + 1)",
      filter: "t.status = 'APROVADO' AND t.start_time IS NULL",
    },
    avg_review_hours: {
      kind: "avg",
      title: "Tempo médio de decisão",
      format: "hours",
      sql: hoursBetween("t.created_at", "t.reviewed_at"),
      filter: "t.reviewed_at IS NOT NULL",
    },
    people_count: { kind: "countDistinct", title: "Pessoas", format: "integer", sql: "t.user_id" },
  },
  records: {
    columns: ["start", "end", "person", "type", "status", "reviewer", "reason"],
    order: "t.start_date DESC",
  },
};

export const peopleDataset: Dataset = {
  name: "people",
  title: "Pessoas e status",
  description: "Quadro de pessoas por perfil e o status atual (disponível, ausente, offline).",
  category: "Pessoas",
  grain: "um usuário",
  icon: "Users",
  requires: [P.USER_READ],
  source: "public.users t",
  joins: {
    role: { sql: "LEFT JOIN public.roles r ON r.id = t.role_id" },
    presence: { sql: "LEFT JOIN public.user_presence ps ON ps.user_id = t.id" },
  },
  defaultTimeDimension: "created",
  dimensions: {
    person: { title: "Pessoa", type: "string", sql: "t.name", key: "t.id", pii: true },
    role: { title: "Perfil", type: "string", sql: "r.label", key: "t.role_id", joins: ["role"] },
    active: { title: "Cadastro", type: "boolean", sql: "t.active", labels: { true: "Ativo", false: "Inativo" } },
    presence: {
      title: "Status agora",
      type: "string",
      sql: "coalesce(ps.status, 'OFFLINE')",
      joins: ["presence"],
      labels: PRESENCE,
    },
    presence_since: {
      title: "Status desde",
      type: "time",
      sql: "ps.updated_at",
      joins: ["presence"],
      groupable: false,
    },
    created: { title: "Cadastrado em", type: "time", sql: "t.created_at" },
  },
  measures: {
    people_count: { kind: "count", title: "Pessoas", format: "integer" },
    active_count: { kind: "count", title: "Ativas", format: "integer", filter: "t.active" },
    available_count: {
      kind: "count",
      title: "Disponíveis agora",
      format: "integer",
      filter: "t.active AND ps.status = 'DISPONIVEL'",
      joins: ["presence"],
    },
    away_count: {
      kind: "count",
      title: "Ausentes agora",
      format: "integer",
      filter: "t.active AND ps.status = 'AUSENTE'",
      joins: ["presence"],
    },
    offline_count: {
      kind: "count",
      title: "Offline agora",
      format: "integer",
      filter: "t.active AND coalesce(ps.status, 'OFFLINE') = 'OFFLINE'",
      joins: ["presence"],
    },
    availability_rate: {
      kind: "ratio",
      title: "Disponibilidade",
      numerator: "available_count",
      denominator: "active_count",
      format: "percent",
    },
  },
  records: { columns: ["person", "role", "active", "presence", "presence_since"], order: "t.name" },
};
