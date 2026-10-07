import { compileQuery, MAX_LIMIT } from "../src/analytics/domain/engine/compile";
import { bucketEnd, resolvePreset } from "../src/analytics/domain/period";
import { buildCatalog } from "../src/analytics/domain/semantic/registry";
import { SecurityContext } from "../src/analytics/domain/types";
import { validateQuerySpec } from "../src/analytics/domain/validation";
import { toCsv } from "../src/delivery/application/export";
import { nextRunAt } from "../src/delivery/domain/schedule";
import { validateReportInput, withRange } from "../src/reports/domain/report";
import { SYSTEM_DASHBOARDS, SYSTEM_REPORTS } from "../src/reports/domain/system-reports";
import { PERMISSIONS } from "./support/seed";

const catalog = buildCatalog({ standardWorkdayMinutes: 480, lateToleranceMinutes: 10 });
const ctx: SecurityContext = { tenantId: "aaaaaaaa-0000-4000-8000-000000000001", userId: "u", permissions: PERMISSIONS };
const TZ = "America/Sao_Paulo";
const compile = (spec: Parameters<typeof compileQuery>[0]) => compileQuery(spec, ctx, catalog, { timezone: TZ });

describe("compilador: garantias", () => {
  it("o primeiro predicado é a empresa da sessão, como parâmetro", () => {
    const c = compile({ dataset: "service_orders", measures: ["order_count"] });
    expect(c.text).toMatch(/WHERE t\.company_id = \$1::uuid/);
    expect(c.params[0]).toBe(ctx.tenantId);
  });

  it("valor do usuário nunca entra no SQL", () => {
    const evil = "x'); DROP TABLE users; --";
    const c = compile({
      dataset: "service_orders",
      measures: ["order_count"],
      filters: [
        { dimension: "type_service", operator: "equals", values: [evil] },
        { dimension: "location", operator: "contains", values: [evil] },
      ],
    });
    expect(c.text).not.toContain("DROP");
    expect(c.params).toEqual(expect.arrayContaining([evil, `%${evil}%`]));
  });

  it("só referencia parâmetros enviados (e envia só os referenciados)", () => {
    const c = compile({
      dataset: "service_orders",
      measures: ["order_count"],
      filters: [{ dimension: "created", operator: "lte", values: ["2026-09-10"] }],
    });
    const refs = new Set([...c.text.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
    expect([...refs].sort((a, b) => a - b)).toEqual(c.params.map((_, i) => i + 1));
  });

  it("índice é SUM/SUM calculado depois do agrupamento", () => {
    const c = compile({ dataset: "service_orders", measures: ["completion_rate"], dimensions: ["status"] });
    expect(c.text).toContain(`(q."m_concluded_count")::numeric / (q."m_order_count")`);
  });

  it("limite tem teto", () => {
    expect(compile({ dataset: "service_orders", measures: ["order_count"], limit: 999_999 }).limit).toBe(MAX_LIMIT);
  });

  it("nome fora do padrão é barrado antes do catálogo", () => {
    const v = validateQuerySpec({ dataset: "service_orders", measures: ['order_count" OR 1=1'] });
    expect(v.errors.length).toBeGreaterThan(0);
  });
});

describe("relatórios e painéis prontos", () => {
  it("todos compilam com o catálogo e os painéis apontam para relatórios que existem", () => {
    for (const r of SYSTEM_REPORTS) {
      const ds = catalog.get(r.spec.dataset)!;
      expect(ds).toBeDefined();
      expect(r.category).toBe(ds.category);
      compile(withRange(r.spec, ["2026-09-01", "2026-09-30"], ds.defaultTimeDimension));
      expect(validateReportInput({ name: r.name, description: r.description, visualization: r.visualization, spec: r.spec, defaultPeriod: r.defaultPeriod }).errors).toEqual([]);
    }
    const ids = new Set(SYSTEM_REPORTS.map((r) => r.id));
    expect(ids.size).toBe(SYSTEM_REPORTS.length);
    for (const d of SYSTEM_DASHBOARDS) for (const w of d.widgets) expect(ids.has(w.reportId)).toBe(true);
  });
});

describe("períodos", () => {
  const now = new Date("2026-10-07T02:00:00Z"); // 06/10 23:00 em Brasília
  it("usa o dia do fuso, não o de UTC", () => {
    expect(resolvePreset("today", TZ, now)).toEqual(["2026-10-06", "2026-10-06"]);
    expect(resolvePreset("last_month", TZ, now)).toEqual(["2026-09-01", "2026-09-30"]);
    expect(resolvePreset("last_quarter", TZ, now)).toEqual(["2026-07-01", "2026-09-30"]);
    expect(resolvePreset("last_7_days", TZ, now)).toEqual(["2026-09-30", "2026-10-06"]);
  });
  it("fim do bucket para detalhar", () => {
    expect(bucketEnd("2026-02-01", "month")).toBe("2026-02-28");
    expect(bucketEnd("2026-09-07", "week")).toBe("2026-09-13");
    expect(bucketEnd("2026-07-01", "quarter")).toBe("2026-09-30");
  });
});

describe("próximo envio", () => {
  it("diário, semanal e mensal na hora local", () => {
    const after = new Date("2026-10-07T12:30:00Z"); // quarta 09:30 em Brasília
    expect(nextRunAt({ frequency: "DAILY", weekday: null, monthDay: null, hour: 8 }, TZ, after).toISOString()).toBe(
      "2026-10-08T11:00:00.000Z",
    );
    expect(nextRunAt({ frequency: "DAILY", weekday: null, monthDay: null, hour: 10 }, TZ, after).toISOString()).toBe(
      "2026-10-07T13:00:00.000Z",
    );
    expect(nextRunAt({ frequency: "WEEKLY", weekday: 1, monthDay: null, hour: 8 }, TZ, after).toISOString()).toBe(
      "2026-10-12T11:00:00.000Z",
    );
    expect(nextRunAt({ frequency: "MONTHLY", weekday: null, monthDay: 1, hour: 7 }, TZ, after).toISOString()).toBe(
      "2026-11-01T10:00:00.000Z",
    );
  });
});

describe("CSV", () => {
  it("rótulos, vírgula decimal e aspas", () => {
    const csv = toCsv(
      {
        title: "x",
        columns: ["status", "rate", "note"],
        annotation: {
          status: { title: "Situação", type: "string", format: null, role: "dimension", labels: { A: "Ativo" } },
          rate: { title: "Taxa", type: "number", format: "percent", role: "measure" },
          note: { title: "Obs", type: "string", format: null, role: "dimension" },
        },
        data: [{ status: "A", rate: 0.125, note: 'diz "oi"; tchau' }],
      },
      TZ,
    ).toString("utf8");
    expect(csv).toBe('﻿Situação;Taxa;Obs\r\nAtivo;12,5;"diz ""oi""; tchau"\r\n');
  });
});
