import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import type { QueryResult, QuerySpec } from "./types";

export interface QueryState {
  data: QueryResult | null;
  error: ApiError | null;
  loading: boolean;
}

/** Roda uma QuerySpec quando ela muda (comparada por JSON); cancela a anterior. */
export function useQuery(spec: QuerySpec | null, debounceMs = 0): QueryState {
  const key = spec ? JSON.stringify(spec) : "";
  // `forKey`: a qual consulta o dado pertence. Dado de uma consulta anterior nunca
  // é devolvido para a atual (as colunas podem ter mudado).
  const [state, setState] = useState<QueryState & { forKey: string }>({ data: null, error: null, loading: Boolean(spec), forKey: "" });
  const specRef = useRef(spec);
  specRef.current = spec;

  useEffect(() => {
    if (!key) {
      setState({ data: null, error: null, loading: false, forKey: "" });
      return;
    }
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    const timer = setTimeout(() => {
      api
        .query(specRef.current!, ctrl.signal)
        .then((data) => setState({ data, error: null, loading: false, forKey: key }))
        .catch((error: Error) => {
          if (error.name === "AbortError") return;
          setState({ data: null, error: error as ApiError, loading: false, forKey: key });
        });
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [key, debounceMs]);

  const current = state.forKey === key;
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: Boolean(key) && (!current || state.loading),
  };
}

/** Primeira linha (consultas sem agrupamento). */
export const firstRow = (s: QueryState) => s.data?.data[0] ?? null;
