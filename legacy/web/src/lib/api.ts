import type { CatalogDataset, QueryResult, QuerySpec, ReportDefinition, Session } from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: string[]) {
    super(message);
  }
}

/** Disparado quando a sessão cai (401) — o App volta para o login. */
export const SESSION_EXPIRED = "lx:session-expired";

async function call<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      signal,
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError(0, "Sem conexão com o servidor. Verifique a internet e tente de novo.");
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && path !== "/session/login" && path !== "/session") {
      window.dispatchEvent(new Event(SESSION_EXPIRED));
    }
    throw new ApiError(res.status, body?.message ?? `Erro ${res.status}`, body?.details);
  }
  return body as T;
}

export const api = {
  session: () => call<Session>("/session"),
  login: (cpf: string, password: string) =>
    call<Session>("/session/login", { method: "POST", body: JSON.stringify({ cpf, password }) }),
  logout: () => call<void>("/session/logout", { method: "POST" }),
  meta: () => call<{ datasets: CatalogDataset[] }>("/analytics/meta"),
  query: (spec: QuerySpec, signal?: AbortSignal) =>
    call<QueryResult>("/analytics/query", { method: "POST", body: JSON.stringify(spec) }, signal),
  reports: () => call<ReportDefinition[]>("/reports"),
  report: (id: string) => call<ReportDefinition>(`/reports/${encodeURIComponent(id)}`),
  createReport: (body: unknown) => call<ReportDefinition>("/reports", { method: "POST", body: JSON.stringify(body) }),
  updateReport: (id: string, body: unknown) =>
    call<ReportDefinition>(`/reports/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteReport: (id: string) => call<void>(`/reports/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
