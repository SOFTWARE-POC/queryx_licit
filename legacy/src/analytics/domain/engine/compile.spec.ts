/**
 * Invariantes do compilador + execução real dos pipelines compilados sobre
 * fixtures, com o `mingo` (implementação JS da linguagem de agregação do Mongo).
 * O mingo não substitui um teste contra MongoDB, mas pega erro de lógica:
 * pareamento de ponto, fuso, ratios, joins, isolamento de tenant.
 *
 * Limitação conhecida do mingo: `$dateTrunc` com `timezone` erra o DIA perto da
 * meia-noite. Os buckets de série temporal (que usam `$dateTrunc`, correto no
 * MongoDB) são testados longe da meia-noite; a fronteira de dia da jornada usa
 * `$dateFromParts` e é testada exatamente na virada.
 */
import { Decimal128, ObjectId } from "mongodb";
import { Aggregator } from "mingo";
import "mingo/init/system";
import { compile } from "./compile";
import { buildCatalog } from "../semantic/registry";
import { PipelineStage, QueryError, QuerySpec, SecurityContext } from "../types";

const catalog = buildCatalog({ standardWorkdayMinutes: 480 });
const TZ = "America/Sao_Paulo";
const opts = { defaultTimezone: TZ };

const tenant = new ObjectId();
const otherTenant = new ObjectId();
const ctx: SecurityContext = { tenantId: tenant.toHexString(), userId: new ObjectId().toHexString() };

const ana = new ObjectId();
const bruno = new ObjectId();
const anaHomonym = new ObjectId();
const intruder = new ObjectId();
const users = [
  { _id: ana, name: "Ana Souza", password: "hash-secreto" },
  { _id: bruno, name: "Bruno Lima", password: "hash-secreto" },
  { _id: anaHomonym, name: "Ana Souza", password: "hash-secreto" },
  { _id: intruder, name: "Outro Tenant", password: "hash-secreto" },
];

const contractA = new ObjectId();
const contractB = new ObjectId();
const licitX = new ObjectId();
const licitY = new ObjectId();

const collections: Record<string, unknown[]> = {
  users,
  licits: [
    { _id: licitX, company_id: tenant, number_licit: "PE-01/2026", org: "Prefeitura", modality: "Pregão", value_estim: Decimal128.fromString("1000.10"), status: "OPEN" },
    { _id: licitY, company_id: tenant, number_licit: "PE-02/2026", org: "Prefeitura", modality: "Pregão", value_estim: Decimal128.fromString("2000.20"), status: "FINISH" },
    { _id: new ObjectId(), company_id: otherTenant, number_licit: "X", org: "Outro", modality: "Pregão", value_estim: Decimal128.fromString("9999"), status: "OPEN" },
  ],
  contracts: [
    { _id: contractA, company_id: tenant, licit_id: licitX, num_contract: "CT-001", status: "ACTIVE", price_contract: Decimal128.fromString("1500.25"), date_init: new Date("2026-01-01T03:00:00Z"), date_end: new Date("2099-01-01T03:00:00Z") },
    { _id: contractB, company_id: tenant, licit_id: licitY, num_contract: "CT-002", status: "INACTIVE", price_contract: Decimal128.fromString("499.75"), date_init: new Date("2026-02-01T03:00:00Z"), date_end: new Date("2026-06-01T03:00:00Z") },
    { _id: new ObjectId(), company_id: otherTenant, licit_id: licitX, num_contract: "CT-XXX", status: "ACTIVE", price_contract: Decimal128.fromString("1000000"), date_init: new Date("2026-01-01T03:00:00Z"), date_end: new Date("2099-01-01T03:00:00Z") },
  ],
  serviceorders: [
    // tenant: 4 OS no período, 1 concluída, 2 em aberto e atrasadas, 1 em aberto no prazo
    { company: tenant, contract_id: contractA, type_service: "Limpeza", status: "CONCLUIDA", date_init: new Date("2026-09-02T12:00:00Z"), date_prev: new Date("2020-01-01"), createdAt: new Date("2026-09-01T12:00:00Z") },
    { company: tenant, contract_id: contractA, type_service: "Limpeza", status: "PENDENTE", date_init: new Date("2026-09-03T12:00:00Z"), date_prev: new Date("2020-01-01"), createdAt: new Date("2026-09-01T12:00:00Z") },
    { company: tenant, contract_id: contractB, type_service: "Portaria", status: "EM_ANDAMENTO", date_init: new Date("2026-09-10T12:00:00Z"), date_prev: new Date("2020-01-01"), createdAt: new Date("2026-09-01T12:00:00Z") },
    { company: tenant, contract_id: contractB, type_service: "Portaria", status: "PENDENTE", date_init: new Date("2026-09-11T12:00:00Z"), date_prev: new Date("2099-01-01"), createdAt: new Date("2026-09-01T12:00:00Z") },
    // fora do período (31/08 23:00 em Brasília = 01/09 02:00 UTC)
    { company: tenant, contract_id: contractA, type_service: "Limpeza", status: "PENDENTE", date_init: new Date("2026-09-01T02:00:00Z"), date_prev: new Date("2020-01-01"), createdAt: new Date("2026-08-01T12:00:00Z") },
    // outro tenant
    { company: otherTenant, contract_id: contractA, type_service: "Limpeza", status: "PENDENTE", date_init: new Date("2026-09-05T12:00:00Z"), date_prev: new Date("2020-01-01"), createdAt: new Date("2026-09-01T12:00:00Z") },
  ],
  timeentries: [
    // Ana, 01/09: 08:00–12:00 e 13:00–18:30 (Brasília) = 9h30 → 1h30 acima de 8h
    { company: tenant, user: ana, type: "CLOCK_IN", timestamp: new Date("2026-09-01T11:00:00Z"), status: "VALID", source: "API" },
    { company: tenant, user: ana, type: "CLOCK_OUT", timestamp: new Date("2026-09-01T15:00:00Z"), status: "VALID", source: "API" },
    { company: tenant, user: ana, type: "CLOCK_IN", timestamp: new Date("2026-09-01T16:00:00Z"), status: "ADJUSTED", source: "MANUAL", adjusted_by: bruno, adjusted_reason: "Esqueceu de bater", original_timestamp: new Date("2026-09-01T16:20:00Z") },
    { company: tenant, user: ana, type: "CLOCK_OUT", timestamp: new Date("2026-09-01T21:30:00Z"), status: "VALID", source: "FACE" },
    // Bruno, turno noturno: 02/09 22:00 → 03/09 06:00 (Brasília) = 8h, conta no dia 02
    { company: tenant, user: bruno, type: "CLOCK_IN", timestamp: new Date("2026-09-03T01:00:00Z"), status: "VALID", source: "API" },
    { company: tenant, user: bruno, type: "CLOCK_OUT", timestamp: new Date("2026-09-03T09:00:00Z"), status: "VALID", source: "API" },
    // Bruno: marcação invalidada não pode parear nada
    { company: tenant, user: bruno, type: "CLOCK_IN", timestamp: new Date("2026-09-04T11:00:00Z"), status: "INVALIDATED", source: "API", adjusted_by: ana, adjusted_reason: "Duplicada" },
    // Homônima da Ana: 04/09 08:00–12:00 = 4h
    { company: tenant, user: anaHomonym, type: "CLOCK_IN", timestamp: new Date("2026-09-04T11:00:00Z"), status: "VALID", source: "API" },
    { company: tenant, user: anaHomonym, type: "CLOCK_OUT", timestamp: new Date("2026-09-04T15:00:00Z"), status: "VALID", source: "API" },
    // Entrada sem saída (esquecida) — não vira jornada
    { company: tenant, user: anaHomonym, type: "CLOCK_IN", timestamp: new Date("2026-09-05T11:00:00Z"), status: "VALID", source: "API" },
    // Outro tenant, mesmo dia
    { company: otherTenant, user: intruder, type: "CLOCK_IN", timestamp: new Date("2026-09-01T11:00:00Z"), status: "VALID", source: "API" },
    { company: otherTenant, user: intruder, type: "CLOCK_OUT", timestamp: new Date("2026-09-01T23:00:00Z"), status: "VALID", source: "API" },
  ],
};

function run(spec: QuerySpec): { rows: Array<Record<string, unknown>>; pipeline: PipelineStage[] } {
  const compiled = compile(spec, ctx, catalog, opts);
  const source = collections[compiled.collection] ?? [];
  const agg = new Aggregator(compiled.pipeline as never, {
    collectionResolver: (name: string) => (collections[name] ?? []) as never,
  });
  return { rows: agg.run(source as never) as Array<Record<string, unknown>>, pipeline: compiled.pipeline };
}

const SEPT: [string, string] = ["2026-09-01", "2026-09-30"];

describe("invariantes do compilador", () => {
  it.each(catalog.list().map((d) => [d.name, Object.keys(d.measures)[0]]))(
    "[%s] o primeiro estágio é $match com o tenant da sessão",
    (dataset, measure) => {
      const { pipeline } = compile({ dataset, measures: [measure] }, ctx, catalog, opts);
      const first = pipeline[0] as { $match?: unknown };
      expect(first.$match).toBeDefined();
      expect(JSON.stringify(first.$match)).toContain(tenant.toHexString());
    },
  );

  it("ignora qualquer tenant vindo no payload", () => {
    const spec = { dataset: "service_orders", measures: ["order_count"], company: otherTenant.toHexString() } as unknown as QuerySpec;
    const { pipeline } = compile(spec, ctx, catalog, opts);
    expect(JSON.stringify(pipeline)).not.toContain(otherTenant.toHexString());
  });

  it("ratio é SUM/SUM no $project e as partes não vazam no resultado", () => {
    const { pipeline } = compile({ dataset: "service_orders", measures: ["completion_rate"] }, ctx, catalog, opts);
    const project = (pipeline.find((s) => "$project" in s) as { $project: Record<string, unknown> }).$project;
    const group = (pipeline.find((s) => "$group" in s) as { $group: Record<string, unknown> }).$group;
    expect(JSON.stringify(project.completion_rate)).toContain("$divide");
    expect(project).not.toHaveProperty("concluded_count");
    expect(group).toHaveProperty("concluded_count");
    expect(group).toHaveProperty("order_count");
  });

  it("limit sempre tem teto", () => {
    const { pipeline } = compile({ dataset: "licits", measures: ["licit_count"], limit: 999_999 }, ctx, catalog, opts);
    expect(pipeline[pipeline.length - 1]).toEqual({ $limit: 10_000 });
  });

  it("rejeita filtro em dimensão com join", () => {
    expect(() =>
      compile(
        { dataset: "service_orders", measures: ["order_count"], filters: [{ dimension: "contract", operator: "equals", values: ["x"] }] },
        ctx,
        catalog,
        opts,
      ),
    ).toThrow(QueryError);
  });

  it("medida/dimensão desconhecida devolve a lista disponível", () => {
    try {
      compile({ dataset: "service_orders", measures: ["nao_existe"] }, ctx, catalog, opts);
      fail("deveria lançar");
    } catch (e) {
      expect((e as QueryError).available).toContain("order_count");
    }
    expect(() => compile({ dataset: "service_orders", measures: ["order_count"], dimensions: ["__proto__"] }, ctx, catalog, opts)).toThrow(QueryError);
  });

  it("texto de busca vira literal, não regex", () => {
    const { pipeline } = compile(
      { dataset: "service_orders", measures: ["order_count"], filters: [{ dimension: "type_service", operator: "contains", values: ["(a+)+$"] }] },
      ctx,
      catalog,
      opts,
    );
    expect(JSON.stringify(pipeline[0])).toContain("\\\\(a\\\\+\\\\)\\\\+\\\\$");
  });

  it("join de nome de usuário só traz o campo `name`", () => {
    const { pipeline } = compile({ dataset: "work_days", measures: ["worked_hours"], dimensions: ["employee"] }, ctx, catalog, opts);
    const lookup = JSON.stringify(pipeline.find((s) => "$lookup" in s));
    expect(lookup).toContain('"name":1');
    expect(lookup).not.toContain("password");
  });

  it("chave de bucket de tempo não usa ponto (quebraria o $group no Mongo)", () => {
    const c = compile(
      { dataset: "service_orders", measures: ["order_count"], timeDimension: { dimension: "date_init", granularity: "month" } },
      ctx,
      catalog,
      opts,
    );
    expect(c.columns).toContain("date_init__month");
    for (const stage of c.pipeline) {
      const body = Object.values(stage)[0];
      if (stage.$group || stage.$project) {
        for (const key of Object.keys(body as object)) expect(key).not.toContain(".");
      }
    }
  });

  it("rejeita fuso inválido e período invertido", () => {
    expect(() => compile({ dataset: "licits", measures: ["licit_count"], timezone: "Marte/Olimpo" }, ctx, catalog, opts)).toThrow(/Fuso/);
    expect(() =>
      compile({ dataset: "service_orders", measures: ["order_count"], timeDimension: { dimension: "date_init", range: ["2026-09-30", "2026-09-01"] } }, ctx, catalog, opts),
    ).toThrow(/início/);
  });
});

describe("execução (mingo)", () => {
  it("ordens de serviço: período no fuso de Brasília, atraso e taxa de conclusão", () => {
    const { rows } = run({
      dataset: "service_orders",
      measures: ["order_count", "concluded_count", "overdue_count", "completion_rate"],
      timeDimension: { dimension: "date_init", range: SEPT },
    });
    expect(rows).toEqual([{ order_count: 4, concluded_count: 1, overdue_count: 2, completion_rate: 0.25 }]);
  });

  it("ordens de serviço por contrato (join tardio no número do contrato)", () => {
    const { rows } = run({
      dataset: "service_orders",
      measures: ["order_count", "overdue_count"],
      dimensions: ["contract"],
      timeDimension: { dimension: "date_init", range: SEPT },
      order: [["contract", "asc"]],
    });
    expect(rows).toEqual([
      { contract: "CT-001", order_count: 2, overdue_count: 1 },
      { contract: "CT-002", order_count: 2, overdue_count: 1 },
    ]);
  });

  it("filtro por contrato (id) e série semanal começando na segunda", () => {
    const { rows } = run({
      dataset: "service_orders",
      measures: ["order_count"],
      timeDimension: { dimension: "date_init", granularity: "week", range: SEPT },
      filters: [{ dimension: "contract_id", operator: "equals", values: [contractB.toHexString()] }],
    });
    // 10/09 e 11/09 (qui/sex) caem na semana que começa na segunda 07/09
    expect(rows).toEqual([{ date_init__week: new Date("2026-09-07T03:00:00Z"), order_count: 2 }]);
  });

  it("jornada: pareia entradas e saídas, turno noturno conta no dia de início, ignora invalidadas", () => {
    const { rows } = run({
      dataset: "work_days",
      measures: ["days_worked", "worked_hours", "overtime_hours", "first_in", "last_out"],
      dimensions: ["employee_id", "day"],
      timeDimension: { dimension: "day", range: SEPT },
      order: [["day", "asc"]],
    });
    expect(rows).toEqual([
      {
        employee_id: ana.toHexString(),
        day: new Date("2026-09-01T03:00:00Z"),
        days_worked: 1,
        worked_hours: 9.5,
        overtime_hours: 1.5,
        first_in: new Date("2026-09-01T11:00:00Z"),
        last_out: new Date("2026-09-01T21:30:00Z"),
      },
      {
        employee_id: bruno.toHexString(),
        day: new Date("2026-09-02T03:00:00Z"),
        days_worked: 1,
        worked_hours: 8,
        overtime_hours: 0,
        first_in: new Date("2026-09-03T01:00:00Z"),
        last_out: new Date("2026-09-03T09:00:00Z"),
      },
      {
        employee_id: anaHomonym.toHexString(),
        day: new Date("2026-09-04T03:00:00Z"),
        days_worked: 1,
        worked_hours: 4,
        overtime_hours: 0,
        first_in: new Date("2026-09-04T11:00:00Z"),
        last_out: new Date("2026-09-04T15:00:00Z"),
      },
    ]);
  });

  it("jornada por funcionário: homônimos continuam separados e o outro tenant não aparece", () => {
    const { rows } = run({
      dataset: "work_days",
      measures: ["worked_hours", "employee_count"],
      dimensions: ["employee"],
      timeDimension: { dimension: "day", range: SEPT },
      order: [["worked_hours", "desc"]],
    });
    expect(rows).toEqual([
      { employee: "Ana Souza", worked_hours: 9.5, employee_count: 1 },
      { employee: "Bruno Lima", worked_hours: 8, employee_count: 1 },
      { employee: "Ana Souza", worked_hours: 4, employee_count: 1 },
    ]);
  });

  it("período recorta a jornada pelo dia local", () => {
    const { rows } = run({
      dataset: "work_days",
      measures: ["days_worked", "employee_count"],
      timeDimension: { dimension: "day", range: ["2026-09-02", "2026-09-02"] },
    });
    expect(rows).toEqual([{ days_worked: 1, employee_count: 1 }]);
  });

  it("auditoria: ajustes e invalidações com autor e justificativa", () => {
    const { rows } = run({
      dataset: "time_entries",
      measures: ["entry_count"],
      dimensions: ["employee", "status", "adjusted_by", "adjusted_reason"],
      filters: [{ dimension: "status", operator: "equals", values: ["ADJUSTED", "INVALIDATED"] }],
      timeDimension: { dimension: "timestamp", range: SEPT },
      order: [["employee", "asc"]],
    });
    expect(rows).toEqual([
      { employee: "Ana Souza", status: "ADJUSTED", adjusted_by: "Bruno Lima", adjusted_reason: "Esqueceu de bater", entry_count: 1 },
      { employee: "Bruno Lima", status: "INVALIDATED", adjusted_by: "Ana Souza", adjusted_reason: "Duplicada", entry_count: 1 },
    ]);
  });

  it("contratos: Decimal128 somado como número e órgão agrupado antes do join (N:1)", () => {
    const { rows } = run({
      dataset: "contracts",
      measures: ["contract_count", "total_value", "active_value"],
      dimensions: ["org"],
    });
    expect(rows).toEqual([{ org: "Prefeitura", contract_count: 2, total_value: 2000, active_value: 1500.25 }]);
  });

  it("licitações: só do tenant", () => {
    const { rows } = run({ dataset: "licits", measures: ["licit_count", "open_count", "total_estimated"] });
    expect(rows).toEqual([{ licit_count: 2, open_count: 1, total_estimated: 3000.3 }]);
  });
});
