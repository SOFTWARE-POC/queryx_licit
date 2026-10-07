/**
 * Erros de aplicação independentes de framework. O `HttpErrorFilter` traduz cada
 * `kind` para o status HTTP — domínio e casos de uso não conhecem HTTP.
 */
export type AppErrorKind =
  | "invalid"
  | "unauthenticated"
  | "forbidden"
  | "not-found"
  | "conflict"
  | "too-many-requests"
  | "timeout"
  | "unavailable";

export class AppError extends Error {
  constructor(
    public readonly kind: AppErrorKind,
    message: string,
    public readonly details?: string[],
  ) {
    super(message);
    this.name = "AppError";
  }
}
