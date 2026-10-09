import { Catalog } from "../engine/compile";
import { Dataset } from "../types";
import { CatalogOptions } from "./common";
import { accessDataset, auditDataset, contractsDataset, licitsDataset } from "./datasets/admin";
import {
  assignmentsDataset,
  executionsDataset,
  fenceEventsDataset,
  popUsageDataset,
  serviceOrdersDataset,
} from "./datasets/operations";
import {
  absencesDataset,
  attendanceDataset,
  clockAttemptsDataset,
  peopleDataset,
  siteFenceEventsDataset,
  timeEntriesDataset,
  workDaysDataset,
} from "./datasets/people";

/** Catálogo de temas do BI. Um tema novo aqui aparece no construtor na hora. */
export function buildCatalog(options: CatalogOptions): Catalog {
  const list: Dataset[] = [
    serviceOrdersDataset,
    assignmentsDataset,
    executionsDataset,
    fenceEventsDataset,
    popUsageDataset,
    workDaysDataset(options),
    attendanceDataset(options),
    absencesDataset,
    peopleDataset,
    timeEntriesDataset,
    siteFenceEventsDataset,
    clockAttemptsDataset,
    auditDataset,
    accessDataset,
    contractsDataset,
    licitsDataset,
  ];
  const byName = new Map(list.map((d) => [d.name, d]));
  if (byName.size !== list.length) throw new Error("Catálogo com tema repetido.");
  return { get: (name) => byName.get(name), list: () => list };
}
