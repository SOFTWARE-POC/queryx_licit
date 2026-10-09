import { AnalyticsService } from "../src/analytics/application/analytics.service";
import { buildCatalog } from "../src/analytics/domain/semantic/registry";
import { QuerySpec, SecurityContext } from "../src/analytics/domain/types";
import { createTestDb, TestDb } from "./support/db";
import { A, B, OS, PERMISSIONS, seed, U } from "./support/seed";

const TZ = "America/Sao_Paulo";
const NOW = new Date("2026-10-07T15:00:00Z");
const SEPT: [string, string] = ["2026-09-01", "2026-09-30"];

let t: TestDb;
let svc: AnalyticsService;
const catalog = buildCatalog({ standardWorkdayMinutes: 480, lateToleranceMinutes: 10 });
const ctxA: SecurityContext = { tenantId: A, userId: U.ana, permissions: PERMISSIONS };
const ctxB: SecurityContext = { tenantId: B, userId: U.beto, permissions: PERMISSIONS };

beforeAll(async () => {
  t = await createTestDb();
  await seed(t.db);
  svc = new AnalyticsService(catalog, t.db, TZ);
});
afterAll(() => t.close());

const run = (spec: QuerySpec, ctx = ctxA) => svc.query(spec, ctx, NOW);
const rowBy = (data: Array<Record<string, unknown>>, key: string, value: unknown) =>
  data.find((r) => r[key] === value) as Record<string, unknown>;

describe("todo o catálogo roda no Postgres de verdade", () => {
  for (const ds of catalog.list()) {
    const measures = Object.keys(ds.measures);
    const groupable = Object.entries(ds.dimensions).filter(([, d]) => d.groupable !== false);

    it(`${ds.name}: todas as medidas, sem agrupar e por cada campo`, async () => {
      const range = ds.defaultTimeDimension ? { dimension: ds.defaultTimeDimension, range: SEPT } : undefined;
      await run({ dataset: ds.name, measures, ...(range ? { timeDimension: range } : {}) });
      for (const [name] of groupable) {
        await run({ dataset: ds.name, measures, dimensions: [name] });
      }
      for (const [name, dim] of Object.entries(ds.dimensions)) {
        if (dim.type !== "time" && dim.type !== "date") continue;
        for (const granularity of ["day", "week", "month"] as const) {
          await run({ dataset: ds.name, measures: [measures[0]], timeDimension: { dimension: name, granularity, range: SEPT } });
        }
      }
    });

    it(`${ds.name}: detalhamento e valores de filtro`, async () => {
      const rec = await svc.records(
        { dataset: ds.name, ...(ds.defaultTimeDimension ? { timeDimension: { dimension: ds.defaultTimeDimension, range: SEPT } } : {}) },
        ctxA,
        NOW,
      );
      expect(rec.columns).toEqual(ds.records.columns);
      for (const [name, dim] of Object.entries(ds.dimensions)) {
        if (dim.labels || (dim.type === "string" && dim.groupable !== false)) {
          await svc.values({ dataset: ds.name, dimension: name }, ctxA);
        }
      }
    });
  }
});

describe("números conferidos com os dados semeados", () => {
  it("OS: situação, prazo e índices (SUM/SUM)", async () => {
    const r = await run({
      dataset: "service_orders",
      measures: ["order_count", "concluded_count", "overdue_count", "on_time_count", "completion_rate", "on_time_rate", "fence_exits", "messages"],
      timeDimension: { dimension: "created", range: SEPT },
    });
    expect(r.data[0]).toMatchObject({
      order_count: 5,
      concluded_count: 2,
      overdue_count: 1,
      on_time_count: 1,
      completion_rate: 0.4,
      on_time_rate: 0.5,
      fence_exits: 1,
      messages: 1,
    });
  });

  it("OS por time agrupa pela chave e traz 'Sem time'", async () => {
    const r = await run({ dataset: "service_orders", measures: ["order_count"], dimensions: ["team"] });
    expect(rowBy(r.data, "team", "Campo Norte")).toMatchObject({ order_count: 2, team__key: expect.any(String) });
    expect(rowBy(r.data, "team", "Sem time")).toMatchObject({ order_count: 3, team__key: null });
    expect(r.annotation.team).toMatchObject({ role: "dimension", hasKey: true });
  });

  it("envios: aceite, recusa e tempo de resposta", async () => {
    const r = await run({
      dataset: "assignments",
      measures: ["sent_count", "accepted_count", "declined_count", "waiting_count", "acceptance_rate", "avg_response_minutes"],
    });
    expect(r.data[0]).toMatchObject({ sent_count: 5, accepted_count: 3, declined_count: 1, waiting_count: 1, acceptance_rate: 0.75 });
    // (30 + 60 + 10 + 120) / 4
    expect(r.data[0].avg_response_minutes).toBeCloseTo(55);
  });

  it("execuções: aprovação de primeira e fotos", async () => {
    const r = await run({
      dataset: "executions",
      measures: ["exec_count", "approved_count", "rework_count", "approval_rate", "photo_count"],
      dimensions: ["executor"],
      order: [["executor", "asc"]],
    });
    expect(rowBy(r.data, "executor", "Bruno Campo")).toMatchObject({ exec_count: 1, approved_count: 1, photo_count: 2 });
    expect(rowBy(r.data, "executor", "Carla Campo")).toMatchObject({ exec_count: 2, rework_count: 1, approval_rate: 0.5 });
  });

  it("jornadas: pareia entrada/saída, ignora invalidada e turno noturno conta no dia de início", async () => {
    const r = await run({
      dataset: "work_days",
      measures: ["days_worked", "worked_hours", "overtime_hours"],
      dimensions: ["person", "day"],
      timeDimension: { dimension: "day", range: SEPT },
      order: [["person", "asc"], ["day", "asc"]],
    });
    expect(r.data.map((x) => [x.person, x.day, Number((x.worked_hours as number).toFixed(2))])).toEqual([
      ["Bruno Campo", "2026-09-01", 8.5],
      ["Bruno Campo", "2026-09-02", 8.67],
      ["Carla Campo", "2026-09-01", 8],
    ]);
    expect(rowBy(r.data, "day", "2026-09-01").overtime_hours).toBeCloseTo(0.5);
  });

  it("escala x ponto: presente, atraso, falta e falta abonada", async () => {
    const r = await run({
      dataset: "attendance",
      measures: ["scheduled_days"],
      dimensions: ["day", "status"],
      timeDimension: { dimension: "day", range: ["2026-09-01", "2026-09-04"] },
      order: [["day", "asc"]],
    });
    expect(r.data.map((x) => [x.day, x.status])).toEqual([
      ["2026-09-01", "PRESENTE"],
      ["2026-09-02", "ATRASO"],
      ["2026-09-03", "FALTA"],
      ["2026-09-04", "ABONADA"],
    ]);
    const totals = await run({
      dataset: "attendance",
      measures: ["attendance_rate", "late_minutes", "absent_days", "excused_days"],
      timeDimension: { dimension: "day", range: ["2026-09-01", "2026-09-04"] },
    });
    expect(totals.data[0]).toMatchObject({ attendance_rate: 0.5, late_minutes: 20, absent_days: 1, excused_days: 1 });
  });

  it("escala sem período usa os últimos 30 dias (e informa)", async () => {
    const r = await run({ dataset: "attendance", measures: ["scheduled_days"] });
    expect(r.meta.range).toEqual(["2026-09-08", "2026-10-07"]);
  });

  it("contratos e licitações", async () => {
    const c = await run({ dataset: "contracts", measures: ["contract_count", "active_value", "expired_active_count"] });
    expect(c.data[0]).toMatchObject({ contract_count: 2, active_value: 100000, expired_active_count: 1 });
    const l = await run({ dataset: "licits", measures: ["licit_count", "contract_count", "contracted_value"] });
    expect(l.data[0]).toMatchObject({ licit_count: 1, contract_count: 2, contracted_value: 100000 });
  });

  it("cerca do local de ponto: saídas, quanto fora, avisos enviados (evidência) e vistos", async () => {
    const r = await run({
      dataset: "site_fence_events",
      measures: ["exit_count", "return_count", "unseen_exit_count", "alerted_exit_count", "alert_rate", "site_count", "avg_distance"],
    });
    expect(r.data[0]).toMatchObject({
      exit_count: 2,
      return_count: 1,
      unseen_exit_count: 1,
      alerted_exit_count: 1,
      alert_rate: 0.5,
      site_count: 2,
      avg_distance: 80,
    });
    const bySite = await run({ dataset: "site_fence_events", measures: ["exit_count"], dimensions: ["site", "shape"] });
    expect(bySite.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ site: "Sede", shape: "CIRCLE", exit_count: 1 }),
        expect.objectContaining({ site: "Obra", shape: "POLYGON", exit_count: 1 }),
      ]),
    );
    const os = await run({ dataset: "fence_events", measures: ["exit_count", "alerted_exit_count"] });
    expect(os.data[0]).toMatchObject({ exit_count: 1, alerted_exit_count: 1 });
  });

  it("marcações feitas sem internet", async () => {
    const r = await run({ dataset: "time_entries", measures: ["entry_count", "offline_count", "offline_rate"] });
    expect(r.data[0]).toMatchObject({ entry_count: 9, offline_count: 1 });
    expect(r.data[0].offline_rate).toBeCloseTo(1 / 9, 5);
    const byConn = await run({ dataset: "time_entries", measures: ["entry_count"], dimensions: ["offline"] });
    expect(byConn.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ offline: true, entry_count: 1 }),
        expect.objectContaining({ offline: false, entry_count: 8 }),
      ]),
    );
  });

  it("pessoas: status agora entre as ativas", async () => {
    const r = await run({ dataset: "people", measures: ["people_count", "active_count", "available_count", "availability_rate"] });
    expect(r.data[0]).toMatchObject({ people_count: 5, active_count: 4, available_count: 2, availability_rate: 0.5 });
  });
});

describe("filtros, ordem e detalhamento", () => {
  it("filtro pela chave da pessoa e por texto", async () => {
    const r = await run({
      dataset: "time_entries",
      measures: ["entry_count"],
      filters: [{ dimension: "person", operator: "equals", values: [U.carla] }],
    });
    expect(r.data[0].entry_count).toBe(3);
    const s = await run({
      dataset: "service_orders",
      measures: ["order_count"],
      filters: [{ dimension: "type_service", operator: "contains", values: ["manut"] }],
    });
    expect(s.data[0].order_count).toBe(2);
  });

  it("texto do usuário com % e _ é literal", async () => {
    const r = await run({
      dataset: "service_orders",
      measures: ["order_count"],
      filters: [{ dimension: "type_service", operator: "contains", values: ["%"] }],
    });
    expect(r.data[0].order_count).toBe(0);
  });

  it("filtro 'sem valor' casa com a chave nula (detalhar 'Sem time')", async () => {
    const r = await svc.records(
      { dataset: "service_orders", filters: [{ dimension: "team", operator: "notSet" }] },
      ctxA,
      NOW,
    );
    expect(r.data).toHaveLength(3);
    expect(r.linkKind).toBe("service-order");
    expect(r.data.every((x) => typeof x.__link === "string")).toBe(true);
  });

  it("filtro de datas: 'até' inclui o dia", async () => {
    const r = await run({
      dataset: "service_orders",
      measures: ["order_count"],
      filters: [{ dimension: "created", operator: "lte", values: ["2026-09-10"] }],
    });
    expect(r.data[0].order_count).toBe(2);
  });

  it("bucket por mês sai como AAAA-MM-DD do início, em ordem", async () => {
    const r = await run({
      dataset: "service_orders",
      measures: ["order_count"],
      timeDimension: { dimension: "created", granularity: "week", range: SEPT },
    });
    expect(r.columns).toEqual(["created__week", "order_count"]);
    expect(r.data.map((x) => x.created__week)).toEqual(["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21"]);
  });

  it("limite corta e avisa", async () => {
    const r = await run({ dataset: "time_entries", measures: ["entry_count"], dimensions: ["person", "timestamp"], limit: 2 });
    expect(r.data).toHaveLength(2);
    expect(r.meta.truncated).toBe(true);
  });

  it("valores de filtro: pessoas pela chave, enums pelo catálogo", async () => {
    const people = await svc.values({ dataset: "time_entries", dimension: "person" }, ctxA);
    expect(people).toEqual([
      { value: U.bruno, label: "Bruno Campo" },
      { value: U.carla, label: "Carla Campo" },
    ]);
    const status = await svc.values({ dataset: "service_orders", dimension: "status" }, ctxA);
    expect(status.map((s) => s.value)).toEqual(["PENDENTE", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"]);
  });
});

describe("isolamento e permissões", () => {
  it("cada empresa só vê os próprios dados", async () => {
    const a = await run({ dataset: "service_orders", measures: ["order_count"] });
    const b = await run({ dataset: "service_orders", measures: ["order_count"] }, ctxB);
    expect(a.data[0].order_count).toBe(5);
    expect(b.data[0].order_count).toBe(1);
    const rec = await svc.records({ dataset: "service_orders" }, ctxB, NOW);
    expect(rec.data.map((x) => x.__link)).toEqual([OS.osB]);
  });

  it("filtro com id de outra empresa não vaza nada", async () => {
    const r = await run(
      { dataset: "time_entries", measures: ["entry_count"], filters: [{ dimension: "person", operator: "equals", values: [U.bruno] }] },
      ctxB,
    );
    expect(r.data[0].entry_count).toBe(0);
  });

  it("tema sem a permissão do módulo é recusado", async () => {
    const noAudit = { ...ctxA, permissions: ["report:read", "service-order:read"] };
    await expect(run({ dataset: "audit", measures: ["change_count"] }, noAudit)).rejects.toMatchObject({ kind: "forbidden" });
    expect(svc.catalogView(noAudit).map((d) => d.name)).toEqual(["service_orders", "assignments", "executions", "fence_events"]);
  });
});
