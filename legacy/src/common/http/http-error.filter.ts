import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Response } from "express";
import { AppError, AppErrorKind } from "../errors";
import { QueryError } from "../../analytics/domain/types";

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

/**
 * Traduz erros em respostas `{ status, error, message, details? }`. Erro
 * inesperado vira 500 sem detalhe interno (o stack vai pro log, não pro cliente).
 */
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger("HttpError");

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof AppError) {
      res.status(STATUS[exception.kind]).json({
        status: STATUS[exception.kind],
        error: exception.kind,
        message: exception.message,
        ...(exception.details?.length ? { details: exception.details } : {}),
      });
      return;
    }

    if (exception instanceof QueryError) {
      res.status(400).json({
        status: 400,
        error: exception.kind,
        message: exception.message,
        ...(exception.available?.length ? { details: [`Disponíveis: ${exception.available.join(", ")}`] } : {}),
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === "string" ? body : ((body as { message?: string | string[] }).message ?? exception.message);
      res.status(status).json({
        status,
        error: status === HttpStatus.TOO_MANY_REQUESTS ? "too-many-requests" : "http",
        message:
          status === HttpStatus.TOO_MANY_REQUESTS
            ? "Muitas requisições. Aguarde alguns segundos."
            : Array.isArray(message)
              ? message.join(", ")
              : message,
      });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    res.status(500).json({ status: 500, error: "internal", message: "Erro interno. Tente de novo em instantes." });
  }
}
