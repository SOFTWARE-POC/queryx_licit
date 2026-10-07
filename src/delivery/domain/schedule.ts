import { addDays, isoWeekday, isPeriodPreset, PeriodPreset, todayIn, zonedTime } from "../../analytics/domain/period";
import { isObject } from "../../analytics/domain/validation";
import { Author } from "../../reports/domain/report";

export const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const FORMATS = ["XLSX", "CSV"] as const;
export type ExportFormat = (typeof FORMATS)[number];
export const MAX_RECIPIENTS = 50;

export interface ScheduleTiming {
  frequency: Frequency;
  /** Semanal: 1 = segunda ... 7 = domingo. */
  weekday: number | null;
  /** Mensal: dia 1 a 28 (todo mês tem). */
  monthDay: number | null;
  /** Hora local (0-23) no fuso do serviço. */
  hour: number;
}

export interface ScheduleInput extends ScheduleTiming {
  name: string;
  targetType: "report" | "dashboard";
  targetId: string;
  period: PeriodPreset;
  format: ExportFormat;
  /** Ids de usuários da empresa. */
  recipients: string[];
  active: boolean;
}

export interface Schedule extends ScheduleInput {
  id: string;
  companyId: string;
  owner: Author;
  nextRunAt: string;
  lastRunAt: string | null;
  lastStatus: "OK" | "ERRO" | "IGNORADO" | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Próximo envio depois de `after`, no fuso: hoje (ou no próximo dia que casa)
 * na hora marcada. Mensal usa dia 1-28 para existir em todo mês.
 */
export function nextRunAt(t: ScheduleTiming, tz: string, after: Date): Date {
  let day = todayIn(tz, after);
  for (let i = 0; i < 400; i++, day = addDays(day, 1)) {
    const matches =
      t.frequency === "DAILY" ||
      (t.frequency === "WEEKLY" && isoWeekday(day) === t.weekday) ||
      (t.frequency === "MONTHLY" && Number(day.slice(8, 10)) === t.monthDay);
    if (!matches) continue;
    const at = zonedTime(day, t.hour, tz);
    if (at.getTime() > after.getTime()) return at;
  }
  throw new Error("Não foi possível calcular o próximo envio.");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TARGET_ID = /^(sys-[a-z0-9-]{1,40}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function validateScheduleInput(body: unknown): { errors: string[]; input?: ScheduleInput } {
  const errors: string[] = [];
  if (!isObject(body)) return { errors: ["O agendamento precisa ser um objeto JSON."] };
  const allowed = ["name", "targetType", "targetId", "frequency", "weekday", "monthDay", "hour", "period", "format", "recipients", "active"];
  for (const key of Object.keys(body)) if (!allowed.includes(key)) errors.push(`Campo desconhecido: '${key}'.`);

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 2 || name.length > 120) errors.push("O nome precisa ter de 2 a 120 caracteres.");
  if (body.targetType !== "report" && body.targetType !== "dashboard") errors.push("Escolha um relatório ou painel.");
  if (typeof body.targetId !== "string" || !TARGET_ID.test(body.targetId)) errors.push("Relatório ou painel inválido.");
  if (!FREQUENCIES.includes(body.frequency as never)) errors.push("Frequência inválida.");
  const weekday = body.frequency === "WEEKLY" ? body.weekday : null;
  const monthDay = body.frequency === "MONTHLY" ? body.monthDay : null;
  if (body.frequency === "WEEKLY" && !(Number.isInteger(weekday) && (weekday as number) >= 1 && (weekday as number) <= 7)) {
    errors.push("Escolha o dia da semana.");
  }
  if (body.frequency === "MONTHLY" && !(Number.isInteger(monthDay) && (monthDay as number) >= 1 && (monthDay as number) <= 28)) {
    errors.push("Escolha um dia do mês entre 1 e 28.");
  }
  if (!Number.isInteger(body.hour) || (body.hour as number) < 0 || (body.hour as number) > 23) errors.push("Hora inválida.");
  if (!isPeriodPreset(body.period)) errors.push("Período inválido.");
  const format = body.format ?? "XLSX";
  if (!FORMATS.includes(format as never)) errors.push("Formato deve ser XLSX ou CSV.");
  const recipients = body.recipients;
  if (
    !Array.isArray(recipients) ||
    recipients.length === 0 ||
    recipients.length > MAX_RECIPIENTS ||
    !recipients.every((r) => typeof r === "string" && UUID.test(r))
  ) {
    errors.push(`Escolha de 1 a ${MAX_RECIPIENTS} destinatários.`);
  }
  if (body.active !== undefined && typeof body.active !== "boolean") errors.push("'active' deve ser sim/não.");
  if (errors.length) return { errors };
  return {
    errors: [],
    input: {
      name,
      targetType: body.targetType as "report" | "dashboard",
      targetId: body.targetId as string,
      frequency: body.frequency as Frequency,
      weekday: (weekday as number | null) ?? null,
      monthDay: (monthDay as number | null) ?? null,
      hour: body.hour as number,
      period: body.period as PeriodPreset,
      format: format as ExportFormat,
      recipients: [...new Set((recipients as string[]).map((r) => r.toLowerCase()))],
      active: body.active === undefined ? true : (body.active as boolean),
    },
  };
}
