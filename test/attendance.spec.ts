import { AnalyticsService } from "../src/analytics/application/analytics.service";
import { buildCatalog } from "../src/analytics/domain/semantic/registry";
import { QuerySpec, SecurityContext } from "../src/analytics/domain/types";
import { createTestDb, TestDb } from "./support/db";
import { A, PERMISSIONS, seed, U } from "./support/seed";

// Escala x ponto (LIC-50): saída antecipada, tolerâncias por empresa/escala e ciclo 12x36.
const TZ = "America/Sao_Paulo";
const NOW = new Date("2026-10-07T15:00:00Z");
const ts = (local: string) => `'${local}:00-03'::timestamptz`;
const COMERCIAL = "a5000000-0000-4000-8000-000000000001";
const PLANTAO = "a5000000-0000-4000-8000-0000000000c1";

let t: TestDb;
let svc: AnalyticsService;
const catalog = buildCatalog({ standardWorkdayMinutes: 480, lateToleranceMinutes: 10, earlyLeaveToleranceMinutes: 10 });
const ctx: SecurityContext = { tenantId: A, userId: U.ana, permissions: PERMISSIONS };
const run = (spec: QuerySpec) => svc.query(spec, ctx, NOW);
const exec = (sql: string) => t.pg.exec(sql);

const byPerson = (id: string) => [{ dimension: "person", operator: "equals" as const, values: [id] }];

beforeAll(async () => {
  t = await createTestDb();
  await seed(t.db);
  // Carla: plantão 12x36 das 19h a partir de 01/09, sem turnos próprios (os dias saem do ciclo).
  // A batida dela no seed é 01/09 22:00 → 02/09 06:00 (3 h de atraso e 1 h antes do fim).
  await exec(`
    INSERT INTO schedules (id, company_id, name, status, shift_type, start_date, start_time, end_time,
                           pattern_type, cycle_work_hours, cycle_rest_hours)
    VALUES ('${PLANTAO}', '${A}', 'Plantão 12x36', 'ACTIVE', 'CUSTOM', ${ts("2026-09-01 00:00")},
            '19:00', '07:00', 'CYCLE', 12, 36);
    INSERT INTO schedule_workers (company_id, schedule_id, user_id) VALUES ('${A}', '${PLANTAO}', '${U.carla}');
    -- Bruno sai 30 min antes do fim do turno numa segunda.
    INSERT INTO time_entries (company_id, user_id, type, timestamp, source, status) VALUES
      ('${A}', '${U.bruno}', 'CLOCK_IN', ${ts("2026-09-07 08:00")}, 'API', 'VALID'),
      ('${A}', '${U.bruno}', 'CLOCK_OUT', ${ts("2026-09-07 16:30")}, 'API', 'VALID');
  `);
  svc = new AnalyticsService(catalog, t.db, TZ);
});
afterAll(() => t.close());

describe("escala x ponto", () => {
  it("ciclo 12x36: os plantões saem da data de início, com atraso, saída antecipada e faltas", async () => {
    const r = await run({
      dataset: "attendance",
      measures: ["scheduled_days"],
      dimensions: ["day", "status", "late_minutes", "early_leave_minutes", "early_leave"],
      filters: byPerson(U.carla),
      timeDimension: { dimension: "day", range: ["2026-09-01", "2026-09-06"] },
      order: [["day", "asc"]],
    });
    expect(r.data.map((x) => [x.day, x.status, x.late_minutes, x.early_leave_minutes, x.early_leave])).toEqual([
      ["2026-09-01", "ATRASO", 180, 60, true],
      ["2026-09-03", "FALTA", null, null, false],
      ["2026-09-05", "FALTA", null, null, false],
    ]);
  });

  it("saída antecipada na escala semanal entra nas medidas (acima da tolerância)", async () => {
    const r = await run({
      dataset: "attendance",
      measures: ["early_leave_days", "early_leave_minutes"],
      filters: byPerson(U.bruno),
      timeDimension: { dimension: "day", range: ["2026-09-01", "2026-09-07"] },
    });
    expect(r.data[0]).toMatchObject({ early_leave_days: 1, early_leave_minutes: 30 });
  });

  it("tolerância: a da empresa vale no lugar da padrão e a da escala vale acima das duas", async () => {
    const day02 = async () => {
      const r = await run({
        dataset: "attendance",
        measures: ["scheduled_days"],
        dimensions: ["day", "status"],
        filters: byPerson(U.bruno),
        timeDimension: { dimension: "day", range: ["2026-09-02", "2026-09-02"] },
      });
      return r.data[0]?.status;
    };
    // Padrão do serviço (10 min): 20 min de atraso → ATRASO.
    expect(await day02()).toBe("ATRASO");

    // Empresa tolera 30 min → PRESENTE.
    await exec(`INSERT INTO attendance_settings (company_id, late_tolerance_minutes, early_leave_tolerance_minutes)
                VALUES ('${A}', 30, 45)`);
    expect(await day02()).toBe("PRESENTE");

    // Empresa com 45 min de tolerância na saída: os 30 min do Bruno não contam mais.
    const early = await run({
      dataset: "attendance",
      measures: ["early_leave_days"],
      filters: byPerson(U.bruno),
      timeDimension: { dimension: "day", range: ["2026-09-01", "2026-09-07"] },
    });
    expect(early.data[0]).toMatchObject({ early_leave_days: 0 });

    // A escala tolera 0 → ATRASO de novo, mesmo com a empresa tolerando 30.
    await exec(`UPDATE schedules SET late_tolerance_minutes = 0 WHERE id = '${COMERCIAL}'`);
    expect(await day02()).toBe("ATRASO");

    await exec(`UPDATE schedules SET late_tolerance_minutes = NULL WHERE id = '${COMERCIAL}';
                DELETE FROM attendance_settings WHERE company_id = '${A}';`);
  });
});
