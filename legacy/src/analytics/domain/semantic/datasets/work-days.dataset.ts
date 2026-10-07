import { Dataset, PipelineStage, SourceOptions } from "../../types";
import { userName } from "../lookups";

/** Uma entrada sem saída em até 24h é marcação esquecida, não jornada. */
const MAX_SESSION_MINUTES = 24 * 60;

/**
 * Deriva jornadas diárias a partir das marcações:
 *  1. pareia cada entrada com a marcação seguinte do mesmo funcionário
 *     ($setWindowFields + $shift) — um período trabalhado é ENTRADA → SAÍDA;
 *  2. descarta pares inválidos (entrada seguida de entrada, > 24h);
 *  3. agrupa os períodos por funcionário e DIA LOCAL da entrada (turnos que
 *     cruzam a meia-noite contam no dia em que começaram).
 * Marcações invalidadas não entram; ajustadas entram com o horário ajustado.
 */
function workDaysSource(standardMinutes: number) {
  return ({ timezone }: SourceOptions): PipelineStage[] => [
    {
      $setWindowFields: {
        partitionBy: "$user",
        sortBy: { timestamp: 1 },
        output: {
          __next: { $shift: { output: { type: "$type", ts: "$timestamp" }, by: 1, default: null } },
        },
      },
    },
    { $match: { type: "CLOCK_IN", "__next.type": "CLOCK_OUT" } },
    {
      $project: {
        user: 1,
        start: "$timestamp",
        end: "$__next.ts",
        minutes: { $divide: [{ $subtract: ["$__next.ts", "$timestamp"] }, 60_000] },
      },
    },
    { $match: { minutes: { $gt: 0, $lte: MAX_SESSION_MINUTES } } },
    {
      $group: {
        _id: {
          user: "$user",
          // Dia LOCAL da entrada. $dateFromParts(+$year/$month/$dayOfMonth no
          // fuso) em vez de $dateTrunc: mesmo resultado no MongoDB, funciona em
          // qualquer versão e é verificável nos testes (o mingo erra o
          // $dateTrunc diário com fuso perto da meia-noite).
          day: {
            $dateFromParts: {
              year: { $year: { date: "$start", timezone } },
              month: { $month: { date: "$start", timezone } },
              day: { $dayOfMonth: { date: "$start", timezone } },
              timezone,
            },
          },
        },
        minutes: { $sum: "$minutes" },
        sessions: { $sum: 1 },
        first_in: { $min: "$start" },
        last_out: { $max: "$end" },
      },
    },
    {
      $project: {
        _id: 0,
        user: "$_id.user",
        day: "$_id.day",
        minutes: 1,
        sessions: 1,
        first_in: 1,
        last_out: 1,
        overtime_minutes: { $max: [0, { $subtract: ["$minutes", standardMinutes] }] },
      },
    },
  ];
}

function hoursLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

/**
 * Jornadas (derivado de `timeentries`). GRÃO: um dia trabalhado de um
 * funcionário. Base de frequência, horas trabalhadas e horas extras.
 *
 * "Horas acima da jornada" compara com uma jornada diária padrão
 * (`STANDARD_WORKDAY_MINUTES`, 8h por padrão), não com a escala contratada de
 * cada pessoa — essa comparação exige cruzar com `schedules`.
 */
export function buildWorkDaysDataset(standardWorkdayMinutes: number): Dataset {
  const std = hoursLabel(standardWorkdayMinutes);
  const hours = (field: string) => ({ $divide: [`$${field}`, 60] });

  return {
    name: "work_days",
    title: "Jornada diária",
    description: `Dias trabalhados e horas por funcionário, pareando entradas e saídas do ponto. Jornada padrão: ${std}/dia.`,
    collection: "timeentries",
    grain: "um dia trabalhado de um funcionário",
    tenantField: "company",
    baseMatch: { status: { $ne: "INVALIDATED" } },
    source: workDaysSource(standardWorkdayMinutes),
    // Folga de 1 dia: um turno que começa no último dia do período e termina
    // depois da meia-noite precisa da saída pra ser pareado.
    prefilter: { field: "timestamp", padDays: 1 },
    defaultTimeDimension: "day",

    dimensions: {
      employee: { title: "Funcionário", type: "string", expr: "__user.name", pii: true, lookup: userName("user", "__user") },
      employee_id: { title: "Funcionário (id)", type: "id", expr: "user" },
      day: { title: "Dia", type: "time", expr: "day", format: "date" },
    },

    measures: {
      days_worked: { kind: "count", title: "Dias trabalhados", format: "integer" },
      employee_count: { kind: "countDistinct", title: "Funcionários", field: "user", format: "integer" },
      worked_hours: { kind: "sum", title: "Horas trabalhadas", expr: hours("minutes"), format: "hours" },
      avg_daily_hours: { kind: "avg", title: "Média por dia", expr: hours("minutes"), format: "hours" },
      overtime_hours: {
        kind: "sum",
        title: `Horas acima de ${std}/dia`,
        expr: hours("overtime_minutes"),
        format: "hours",
      },
      overtime_days: {
        kind: "count",
        title: "Dias acima da jornada",
        format: "integer",
        filter: { $gt: ["$overtime_minutes", 0] },
      },
      sessions: { kind: "sum", title: "Períodos trabalhados", field: "sessions", format: "integer" },
      first_in: { kind: "min", title: "Primeira entrada", field: "first_in", format: "time", valueType: "time" },
      last_out: { kind: "max", title: "Última saída", field: "last_out", format: "time", valueType: "time" },
    },
  };
}
