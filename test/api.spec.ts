import ExcelJS from "exceljs";
import { binary, createHarness, Harness } from "./support/harness";
import { U } from "./support/seed";


let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(() => h.close());

const SEPT = { dimension: "created", range: ["2026-09-01", "2026-09-30"] };

const customReport = {
  name: "OS por tipo e time",
  description: "Teste",
  visualization: "bar",
  defaultPeriod: "last_30_days",
  spec: { dataset: "service_orders", measures: ["order_count", "completion_rate"], dimensions: ["type_service"] },
};

describe("acesso", () => {
  it("sem token: 401; sem report:read: 403; health é público", async () => {
    await h.http().get("/reports").expect(401);
    const r = await h.http("bruno").get("/reports").expect(403);
    expect(r.body.message).toContain("report:read");
    await h.http().get("/health").expect(200, { status: "ok" });
  });

  it("/me diz se pode gerenciar e se o e-mail está ligado", async () => {
    const ana = await h.http("ana").get("/me").expect(200);
    expect(ana.body.data).toMatchObject({ canManage: true, mailEnabled: true, timezone: "America/Sao_Paulo" });
    const gil = await h.http("gil").get("/me").expect(200);
    expect(gil.body.data.canManage).toBe(false);
  });

  it("catálogo e relatórios prontos só dos temas permitidos", async () => {
    const cat = await h.http("gil").get("/analytics/catalog").expect(200);
    const names = cat.body.data.map((d: { name: string }) => d.name);
    expect(names).toContain("attendance");
    expect(names).not.toContain("audit");
    expect(names).not.toContain("absences");
    const reports = await h.http("gil").get("/reports").expect(200);
    const ids = reports.body.data.map((r: { id: string }) => r.id);
    expect(ids).toContain("sys-assiduidade");
    expect(ids).not.toContain("sys-alteracoes");
    await h.http("gil").get("/reports/sys-alteracoes").expect(403);
  });
});

describe("consulta", () => {
  it("roda, valida a forma e explica o erro", async () => {
    const ok = await h
      .http("ana")
      .post("/analytics/query", { dataset: "service_orders", measures: ["order_count"], timeDimension: SEPT })
      .expect(200);
    expect(ok.body.data.data[0].order_count).toBe(5);

    const bad = await h.http("ana").post("/analytics/query", { dataset: "service_orders", measures: [], hack: 1 }).expect(400);
    expect(bad.body.details).toEqual(expect.arrayContaining(["consulta: campo desconhecido 'hack'.", "Escolha ao menos uma medida."]));

    const unknown = await h.http("ana").post("/analytics/query", { dataset: "service_orders", measures: ["nope"] }).expect(400);
    expect(unknown.body.error).toBe("unknown-measure");

    await h.http("gil").post("/analytics/query", { dataset: "audit", measures: ["change_count"] }).expect(403);
  });

  it("detalhamento e valores de filtro", async () => {
    const rec = await h
      .http("ana")
      .post("/analytics/records", {
        dataset: "service_orders",
        timeDimension: SEPT,
        filters: [{ dimension: "status", operator: "equals", values: ["CONCLUIDA"] }],
      })
      .expect(200);
    expect(rec.body.data.data).toHaveLength(2);
    const vals = await h.http("ana").post("/analytics/values", { dataset: "assignments", dimension: "person" }).expect(200);
    expect(vals.body.data.map((v: { label: string }) => v.label)).toEqual(["Bruno Campo", "Carla Campo"]);
  });

  it("exporta CSV para Excel em português", async () => {
    const res = await h
      .http("ana")
      .post("/analytics/export", {
        title: "Teste CSV",
        format: "csv",
        spec: { dataset: "service_orders", measures: ["order_count", "completion_rate"], dimensions: ["status"], timeDimension: SEPT },
      })
      .expect(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("teste-csv.csv");
    const text: string = res.text.replace(/^﻿/, "");
    expect(text.split("\r\n")[0]).toBe("Situação;OS;Taxa de conclusão");
    expect(text).toContain("Concluída;2;100");
  });
});

describe("relatórios da empresa", () => {
  let id: string;

  it("só quem gerencia cria; nomes inválidos são recusados", async () => {
    await h.http("gil").post("/reports", customReport).expect(403);
    const bad = await h
      .http("ana")
      .post("/reports", { ...customReport, spec: { ...customReport.spec, dimensions: ["nao_existe"] } })
      .expect(400);
    expect(bad.body.error).toBe("unknown-dimension");
    const withRange = await h
      .http("ana")
      .post("/reports", { ...customReport, spec: { ...customReport.spec, timeDimension: SEPT } })
      .expect(400);
    expect(withRange.body.details[0]).toContain("não guarda período");

    const created = await h.http("ana").post("/reports", customReport).expect(201);
    id = created.body.data.id;
    expect(created.body.data).toMatchObject({ system: false, category: "Operação", createdBy: { id: U.ana, name: "Ana Admin" } });
  });

  it("aparece na lista de quem pode ver o tema; outra empresa não acha", async () => {
    const list = await h.http("gil").get("/reports").expect(200);
    expect(list.body.data.some((r: { id: string }) => r.id === id)).toBe(true);
    await h.http("beto").get(`/reports/${id}`).expect(404);
  });

  it("edita (quem editou fica registrado); prontos não se editam", async () => {
    const upd = await h.http("ana").put(`/reports/${id}`, { ...customReport, name: "Renomeado" }).expect(200);
    expect(upd.body.data.name).toBe("Renomeado");
    await h.http("ana").put("/reports/sys-os-tipo", customReport).expect(400);
  });

  it("exporta XLSX com período", async () => {
    const res = await h
      .http("ana")
      .get(`/reports/${id}/export?format=xlsx&from=2026-09-01&to=2026-09-30`)
      .buffer(true)
      .parse(binary)
      .expect(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as never);
    const ws = wb.worksheets[0];
    expect(ws.getCell("A1").value).toBe("Renomeado");
    expect(ws.getCell("A2").value).toBe("01/09/2026 a 30/09/2026");
    expect(ws.getRow(4).values).toEqual([undefined, "Tipo de serviço", "OS", "Taxa de conclusão"]);
    expect(ws.getCell("C5").numFmt).toBe("0.0%");
  });
});

describe("painéis", () => {
  let id: string;

  it("cria com itens; item de tema sem permissão é recusado", async () => {
    const body = {
      name: "Meu painel",
      defaultPeriod: "this_month",
      widgets: [
        { id: "a", reportId: "sys-os-situacao", size: "sm" },
        { id: "b", reportId: "sys-jornada", size: "lg", visualization: "hbar", title: "Horas" },
      ],
    };
    const created = await h.http("ana").post("/dashboards", body).expect(201);
    id = created.body.data.id;
    expect(created.body.data.widgets).toHaveLength(2);
    await h.http("gil").post("/dashboards", body).expect(403);
    const anaAudit = { ...body, widgets: [{ id: "x", reportId: "sys-alteracoes", size: "md" }] };
    await h.http("ana").post("/dashboards", anaAudit).expect(201);
  });

  it("lista os prontos e os da empresa; exporta uma aba por relatório", async () => {
    const list = await h.http("gil").get("/dashboards").expect(200);
    expect(list.body.data.map((d: { id: string }) => d.id)).toEqual(expect.arrayContaining(["sys-dash-operacao", id]));
    const res = await h
      .http("ana")
      .get(`/dashboards/${id}/export?from=2026-09-01&to=2026-09-30`)
      .buffer(true)
      .parse(binary)
      .expect(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["OS por situação", "Frequência e jornada"]);
  });
});

describe("envios agendados", () => {
  const base = {
    name: "Semanal de abonos",
    targetType: "report",
    targetId: "sys-abonos",
    frequency: "WEEKLY",
    weekday: 1,
    hour: 8,
    period: "last_month",
    format: "XLSX",
    recipients: [U.ana, U.gil],
  };

  it("destinatários: ativos com permissão de relatórios", async () => {
    const r = await h.http("ana").get("/schedules/recipients").expect(200);
    expect(r.body.data.map((p: { name: string }) => p.name)).toEqual(["Ana Admin", "Gil Gestor"]);
  });

  it("valida; 'enviar agora' só manda para quem pode ver o tema", async () => {
    const bad = await h.http("ana").post("/schedules", { ...base, weekday: 9, recipients: [] }).expect(400);
    expect(bad.body.details).toEqual(expect.arrayContaining(["Escolha o dia da semana."]));
    await h.http("ana").post("/schedules", { ...base, recipients: [U.davi] }).expect(400);

    const created = await h.http("ana").post("/schedules", base).expect(201);
    const s = created.body.data;
    expect(s.owner).toEqual({ id: U.ana, name: "Ana Admin" });
    expect(new Date(s.nextRunAt).getUTCHours()).toBe(11); // 08:00 em Brasília

    h.mailer.sent = [];
    const run = await h.http("ana").post(`/schedules/${s.id}/run`).expect(200);
    // Gil perdeu absence:read por exceção individual: não recebe.
    expect(run.body.data).toMatchObject({ status: "OK", recipientCount: 1 });
    expect(h.mailer.sent.map((m) => m.to.email)).toEqual(["ana@a.com"]);
    const mail = h.mailer.sent[0];
    expect(mail.subject).toContain("Ausências e abonos · Mês passado");
    expect(mail.attachments[0].filename).toMatch(/^ausencias-e-abonos-\d{4}-\d{2}-01-a-.*\.xlsx$/);
    expect(mail.html).toContain("https://painel.test/admin/relatorios");

    const runs = await h.http("ana").get(`/schedules/${s.id}/runs`).expect(200);
    expect(runs.body.data[0]).toMatchObject({ trigger: "MANUAL", status: "OK", recipientCount: 1 });
  });

  it("o relógio roda os vencidos e marca o próximo envio", async () => {
    const created = await h.schedules.create(
      { tenantId: "aaaaaaaa-0000-4000-8000-000000000001", userId: U.ana, name: "Ana Admin", permissions: [] },
      { ...base, name: "Diário OS", targetType: "dashboard", targetId: "sys-dash-operacao", frequency: "DAILY", recipients: [U.gil] },
      new Date("2026-10-01T12:00:00Z"),
    );
    expect(created.nextRunAt).toBe("2026-10-02T11:00:00.000Z");
    h.mailer.sent = [];
    const processed = await h.schedules.runDue(new Date("2026-10-02T11:00:30Z"));
    expect(processed).toBeGreaterThanOrEqual(1);
    expect(h.mailer.sent.map((m) => m.to.email)).toContain("gil@a.com");
    const after = await h.http("ana").get("/schedules").expect(200);
    const s = after.body.data.find((x: { id: string }) => x.id === created.id);
    expect(s).toMatchObject({ lastStatus: "OK", nextRunAt: "2026-10-03T11:00:00.000Z" });
    // Rodar de novo no mesmo minuto não reenvia.
    h.mailer.sent = [];
    await h.schedules.runDue(new Date("2026-10-02T11:00:40Z"));
    expect(h.mailer.sent).toHaveLength(0);
  });

  it("excluir o relatório remove os agendamentos dele", async () => {
    const report = await h.http("ana").post("/reports", { ...customReport, name: "Temporário" }).expect(201);
    const s = await h
      .http("ana")
      .post("/schedules", { ...base, targetId: report.body.data.id, recipients: [U.ana] })
      .expect(201);
    await h.http("ana").delete(`/reports/${report.body.data.id}`).expect(204);
    await h.http("ana").post(`/schedules/${s.body.data.id}/run`).expect(404);
  });

  it("quem só lê relatórios não mexe em agendamentos", async () => {
    await h.http("gil").get("/schedules").expect(403);
  });
});
