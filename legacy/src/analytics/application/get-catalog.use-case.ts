import { Inject, Injectable } from "@nestjs/common";
import { DatasetLookup } from "../domain/engine/compile";
import { CATALOG } from "./query-executor.port";

/** Catálogo visível: alimenta o construtor de relatórios no front. */
@Injectable()
export class GetCatalogUseCase {
  constructor(@Inject(CATALOG) private readonly catalog: DatasetLookup) {}

  execute() {
    return this.catalog.list().map((ds) => ({
      name: ds.name,
      title: ds.title,
      description: ds.description,
      grain: ds.grain,
      defaultTimeDimension: ds.defaultTimeDimension ?? null,
      dimensions: Object.entries(ds.dimensions).map(([name, d]) => ({
        name,
        title: d.title,
        type: d.type,
        format: d.format ?? null,
        filterable: !d.lookup,
        pii: Boolean(d.pii),
        labels: d.labels ?? null,
      })),
      measures: Object.entries(ds.measures).map(([name, m]) => ({
        name,
        title: m.title,
        kind: m.kind,
        format: m.format ?? (m.kind === "ratio" ? "percent" : "number"),
        description: m.description ?? null,
      })),
    }));
  }
}
