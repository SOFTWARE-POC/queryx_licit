import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Response } from "express";
import { QueryError } from "../../analytics/domain/types";
import { AppError, AppErrorKind } from "../errors";

const STATUS: Record<AppErrorKind, number> = {
  invalid: 400,
  unauthenticated: 401,
  forbidden: 403,
  "not-found": 404,
  conflict: 409,
  "too-many-requests": 429,
  timeout: 504,
  unavailable: 503,
};

/** Código do Postgres para consulta cancelada por `statement_timeout`. */
const PG_QUERY_CANCELED = "57014";

/**
 * Traduz erros em `{ status, error, message, details? }`. Erro inesperado vira
 * 500 sem detalhe interno (o stack vai para o log, não para o cliente).
 */
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger("HttpError");

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const send = (status: number, error: string, message: string, details?: string[]) =>
      res.status(status).json({ status, error, message, ...(details?.length ? { details } : {}) });

    if (exception instanceof AppError) {
      return void send(STATUS[exception.kind], exception.kind, exception.message, exception.details);
    }
    if (exception instanceof QueryError) {
      const status = exception.kind === "forbidden" ? 403 : 400;
      return void send(
        status,
        exception.kind,
        exception.message,
        exception.available?.length ? [`Disponíveis: ${exception.available.join(", ")}`] : undefined,
      );
    }
    if ((exception as { code?: string })?.code === PG_QUERY_CANCELED) {
      return void send(504, "timeout", "A consulta demorou demais. Diminua o período ou os agrupamentos.");
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === "string" ? body : ((body as { message?: string | string[] }).message ?? exception.message);
      return void send(
        status,
        status === HttpStatus.TOO_MANY_REQUESTS ? "too-many-requests" : "http",
        status === HttpStatus.TOO_MANY_REQUESTS
          ? "Muitas requisições. Aguarde alguns segundos."
          : Array.isArray(message)
            ? message.join(", ")
            : message,
      );
    }
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    send(500, "internal", "Erro interno. Tente de novo em instantes.");
  }
}
