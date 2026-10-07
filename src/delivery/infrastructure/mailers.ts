import { Logger } from "@nestjs/common";
import nodemailer from "nodemailer";
import { Mailer, MailMessage } from "../application/ports";

/** Sem provedor: os agendamentos mostram "e-mail não configurado". */
export class DisabledMailer implements Mailer {
  readonly enabled = false;
  async send(): Promise<void> {
    throw new Error("Envio de e-mail não configurado no servidor.");
  }
}

/** Desenvolvimento: só registra no log o que seria enviado. */
export class LogMailer implements Mailer {
  readonly enabled = true;
  private readonly logger = new Logger("Mail");
  async send(m: MailMessage): Promise<void> {
    this.logger.log(`[e-mail] para ${m.to.email}: ${m.subject} (${m.attachments.map((a) => a.filename).join(", ")})`);
  }
}

/** SMTP (`SMTP_URL=smtps://usuario:senha@smtp.exemplo.com:465`). */
export class SmtpMailer implements Mailer {
  readonly enabled = true;
  private readonly transport: nodemailer.Transporter;

  constructor(
    url: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport(url);
  }

  async send(m: MailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: { name: m.to.name, address: m.to.email },
      subject: m.subject,
      html: m.html,
      text: m.text,
      attachments: m.attachments.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
    });
  }
}

/**
 * Resend (API HTTP). Útil onde a porta SMTP de saída é bloqueada (ex.: alguns
 * planos do Railway).
 */
export class ResendMailer implements Mailer {
  readonly enabled = true;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(m: MailMessage): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: this.from,
        to: [`${m.to.name.replace(/[<>"]/g, "")} <${m.to.email}>`],
        subject: m.subject,
        html: m.html,
        text: m.text,
        attachments: m.attachments.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Resend respondeu ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
    }
  }
}
