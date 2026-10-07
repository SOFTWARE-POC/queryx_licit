import { Author } from "../../reports/domain/report";
import { Schedule, ScheduleInput } from "../domain/schedule";

export interface ScheduleRun {
  id: string;
  trigger: "AGENDADO" | "MANUAL";
  status: "OK" | "ERRO" | "IGNORADO";
  recipientCount: number;
  range: [string, string] | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface ScheduleRepository {
  list(companyId: string): Promise<Schedule[]>;
  get(companyId: string, id: string): Promise<Schedule | null>;
  create(companyId: string, input: ScheduleInput, owner: Author, nextRunAt: Date): Promise<Schedule>;
  update(companyId: string, id: string, input: ScheduleInput, owner: Author, nextRunAt: Date): Promise<Schedule | null>;
  delete(companyId: string, id: string): Promise<boolean>;
  deleteByTarget(companyId: string, targetType: string, targetId: string): Promise<number>;
  /** Marca como "em execução" os vencidos (com folga para travados) e devolve. */
  claimDue(now: Date, limit: number): Promise<Schedule[]>;
  /** Fim de um envio agendado: libera, grava o resultado e o próximo horário. */
  finish(id: string, result: { status: ScheduleRun["status"]; error: string | null; nextRunAt: Date | null }): Promise<void>;
  addRun(run: Omit<ScheduleRun, "id" | "startedAt" | "finishedAt"> & { scheduleId: string; companyId: string; startedAt: Date }): Promise<void>;
  runs(companyId: string, scheduleId: string, limit: number): Promise<ScheduleRun[]>;
}
export const SCHEDULE_REPOSITORY = Symbol("SCHEDULE_REPOSITORY");

/** Pessoa da empresa com as permissões efetivas (perfil + exceções individuais). */
export interface DirectoryPerson {
  id: string;
  name: string;
  email: string;
  active: boolean;
  permissions: string[];
}

export interface Directory {
  person(companyId: string, userId: string): Promise<DirectoryPerson | null>;
  people(companyId: string): Promise<DirectoryPerson[]>;
}
export const DIRECTORY = Symbol("DIRECTORY");

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface MailMessage {
  to: { email: string; name: string };
  subject: string;
  html: string;
  text: string;
  attachments: MailAttachment[];
}

export interface Mailer {
  /** false = envio por e-mail não configurado (os agendamentos avisam). */
  readonly enabled: boolean;
  send(message: MailMessage): Promise<void>;
}
export const MAILER = Symbol("MAILER");
