import { compile } from "../../analytics/domain/engine/compile";
import { buildCatalog } from "../../analytics/domain/semantic/registry";
import { SYSTEM_REPORTS } from "./system-reports";

const catalog = buildCatalog({ standardWorkdayMinutes: 480 });
const ctx = { tenantId: "507f1f77bcf86cd799439011", userId: "507f1f77bcf86cd799439012" };

describe("relatórios do sistema", () => {
  it.each(SYSTEM_REPORTS.map((r) => [r.id, r]))("%s compila (tabela, indicadores e série)", (_id, r) => {
    const range: [string, string] = ["2026-09-01", "2026-09-30"];
    const td = r.usesPeriod ? { ...r.spec.timeDimension!, range } : undefined;
    expect(() => compile({ ...r.spec, timeDimension: td }, ctx, catalog, { defaultTimezone: "America/Sao_Paulo" })).not.toThrow();
    expect(() =>
      compile({ dataset: r.spec.dataset, measures: r.kpis.measures, filters: r.kpis.filters ?? r.spec.filters, timeDimension: td }, ctx, catalog, {
        defaultTimezone: "America/Sao_Paulo",
      }),
    ).not.toThrow();
    if (r.trend) {
      expect(r.usesPeriod).toBe(true);
      expect(() =>
        compile({ dataset: r.spec.dataset, measures: [r.trend!.measure], timeDimension: { ...td!, granularity: "week" } }, ctx, catalog, {
          defaultTimezone: "America/Sao_Paulo",
        }),
      ).not.toThrow();
    }
  });

  it("ids e códigos únicos", () => {
    expect(new Set(SYSTEM_REPORTS.map((r) => r.id)).size).toBe(SYSTEM_REPORTS.length);
  });
});
