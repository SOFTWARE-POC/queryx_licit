import type { CookieOptions, Request } from "express";

export const SESSION_COOKIE = "lx_reports";

export function sessionCookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, secure, sameSite: "lax", path: "/" };
}

/** Token da requisição: cookie de sessão do front ou `Authorization: Bearer` (integrações). */
export function extractToken(req: Request): string | null {
  const fromCookie = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
  if (fromCookie) return fromCookie;
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}
