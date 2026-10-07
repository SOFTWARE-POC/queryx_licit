import { Dataset } from "../types";
import { DatasetLookup } from "../engine/compile";
import { serviceOrdersDataset } from "./datasets/service-orders.dataset";
import { contractsDataset, licitsDataset } from "./datasets/contracts.dataset";
import { timeEntriesDataset } from "./datasets/time-entries.dataset";
import { buildWorkDaysDataset } from "./datasets/work-days.dataset";

export interface CatalogOptions {
  standardWorkdayMinutes: number;
}

/**
 * Índice de datasets por nome. Nova área de relatório = novo dataset aqui;
 * nenhum endpoint novo.
 */
export function buildCatalog(options: CatalogOptions): DatasetLookup {
  const datasets: Dataset[] = [
    buildWorkDaysDataset(options.standardWorkdayMinutes),
    timeEntriesDataset,
    serviceOrdersDataset,
    contractsDataset,
    licitsDataset,
  ];
  const byName = new Map(datasets.map((d) => [d.name, d]));
  return {
    get: (name) => byName.get(name),
    list: () => datasets,
  };
}
