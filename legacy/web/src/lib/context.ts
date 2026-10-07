import { createContext, useContext } from "react";
import type { CatalogDataset, ReportDefinition, Session } from "./types";
import type { Recorte } from "./recorte";

export interface AppCtx {
  session: Session;
  catalog: CatalogDataset[];
  reports: ReportDefinition[];
  reloadReports: () => Promise<void>;
  recorte: Recorte;
  maskPii: boolean;
  search: string;
  toast: (msg: string) => void;
  dataset: (name: string) => CatalogDataset | undefined;
}

export const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp fora do provider");
  return v;
}
