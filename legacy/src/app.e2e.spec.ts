/**
 * API ponta a ponta: AppModule real + configureHttp (o mesmo de produção). Só as
 * bordas externas são fakes: API principal (identidade), Mongo (executor e
 * repositório de relatórios).
 */
import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { ObjectId } from "mongodb";
import { AppModule } from "./app.module";
import { APP_CONFIG, AppConfig, loadConfig } from "./config/app-config";
import { configureHttp } from "./http-setup";
import { MONGO_CLIENT, MONGO_DB } from "./database/database.module";
import { AppError } from "./common/errors";
import { IDENTITY_PROVIDER, IdentityProviderPort } from "./auth/domain/identity-provider.port";
import { Principal } from "./auth/domain/principal";
import { QUERY_EXECUTOR } from "./analytics/application/query-executor.port";
import { PipelineStage } from "./analytics/domain/types";
import { REPORT_REPOSITORY, NewReport, ReportRepositoryPort } from "./reports/domain/report-repository.port";
import { ReportDefinition } from "./reports/domain/report-definition";

const COMPANY = new ObjectId().toHexString();
const OTHER_COMPANY = new ObjectId().toHexString();

const people: Record<string, Principal> = {
  "token-gestor": {
    userId: new ObjectId().toHexString(),
    name: "Marina Duarte",
    email: "marina@x.com",
    companyId: COMPANY,
    companyName: "Empresa A",
    roleName: "ADMIN",
    permissions: ["report:read", "report:manage"],
  },
  "token-leitor": {
    userId: new ObjectId().toHexString(),
    name: "Leo Leitor",
    email: "leo@x.com",
    companyId: COMPANY,
    companyName: "Empresa A",
    roleName: "MANAGER",
    permissions: ["report:read"],
  },
  "token-worker": {
    userId: new ObjectId().toHexString(),
    name: "Wagner",
    email: "w@x.com",
    companyId: COMPANY,
    companyName: "Empresa A",
    roleName: "WORKER",
    permissions: [],
  },
};

const credentials: Record<string, string> = {
  "11111111111": "token-gestor",
  "22222222222": "token-worker",
};

class FakeIdentity implements IdentityProviderPort {
  forgotten: string[] = [];
  lastIp?: string;
  async introspect(token: string, clientIp?: string) {
    this.lastIp = clientIp;
    const p = people[token];
    if (!p) throw new AppError("unauthenticated", "Sessão encerrada. Faça login novamente.");
    return p;
  }
  async login(cpf: string, password: string) {
    const token = credentials[cpf];
    if (!token || password !== "Senha123") throw new AppError("unauthenticated", "Credenciais inválidas");
    return { token, principal: people[token], expiresAt: new Date(Date.now() + 3_600_000) };
  }
  forget(token: string) {
    this.forgotten.push(token);
  }
}

class FakeReports implements ReportRepositoryPort {
  rows: Array<ReportDefinition & { company: string }> = [];
  async listByCompany(companyId: string) {
    return this.rows.filter((r) => r.company === companyId);
  }
  async findInCompany(companyId: string, id: string) {
    return this.rows.find((r) => r.company === companyId && r.id === id) ?? null;
  }
  async create(companyId: string, report: NewReport) {
    const row = { ...report, id: new ObjectId().toHexString(), system: false, company: companyId };
    this.rows.push(row);
    return row;
  }
  async update(companyId: string, id: string, report: NewReport) {
    const row = await this.findInCompany(companyId, id);
    if (!row) return null;
    Object.assign(row, report);
    return row;
  }
  async delete(companyId: string, id: string) {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !(r.company === companyId && r.id === id));
    return this.rows.length < before;
  }
}

describe("API de relatórios (e2e)", () => {
  let app: NestExpressApplication;
  let identity: FakeIdentity;
  let reports: FakeReports;
  let executed: Array<{ collection: string; pipeline: PipelineStage[] }>;

  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeEach(async () => {
    identity = new FakeIdentity();
    reports = new FakeReports();
    executed = [];
    const config: AppConfig = {
      ...loadConfig({ MONGODB_URI: "mongodb://fake", MAIN_API_URL: "http://api.internal" }),
      webDir: "__sem_front__",
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CONFIG)
      .useValue(config)
      .overrideProvider(MONGO_CLIENT)
      .useValue({ close: async () => undefined })
      .overrideProvider(MONGO_DB)
      .useValue({ command: async () => ({ ok: 1 }) })
      .overrideProvider(IDENTITY_PROVIDER)
      .useValue(identity)
      .overrideProvider(REPORT_REPOSITORY)
      .useValue(reports)
      .overrideProvider(QUERY_EXECUTOR)
      .useValue({
        aggregate: async (collection: string, pipeline: PipelineStage[]) => {
          executed.push({ collection, pipeline });
          return [{ order_count: 3 }];
        },
      })
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false, logger: false });
    configureHttp(app, config);
    await app.init();
  });

  afterEach(() => app.close());

  describe("sessão", () => {
    it("login grava o token num cookie httpOnly e não o devolve no corpo", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/session/login")
        .send({ cpf: "111.111.111-11", password: "Senha123" })
        .expect(200);
      expect(res.body).toEqual({
        timezone: "America/Sao_Paulo",
        name: "Marina Duarte",
        email: "marina@x.com",
        company: { id: COMPANY, name: "Empresa A" },
        role: "ADMIN",
        canManage: true,
      });
      expect(JSON.stringify(res.body)).not.toContain("token-gestor");
      const cookie = String(res.headers["set-cookie"]);
      expect(cookie).toMatch(/^lx_reports=token-gestor;/);
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");

      await request(app.getHttpServer()).get("/api/session").set("Cookie", "lx_reports=token-gestor").expect(200);
    });

    it("recusa login de quem não tem report:read (sem gravar cookie)", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/session/login")
        .send({ cpf: "22222222222", password: "Senha123" })
        .expect(403);
      expect(res.headers["set-cookie"]).toBeUndefined();
      expect(res.body.message).toMatch(/report:read/);
    });

    it("credencial errada → 401 com a mensagem da API principal", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/session/login")
        .send({ cpf: "11111111111", password: "errada" })
        .expect(401);
      expect(res.body.message).toBe("Credenciais inválidas");
    });

    it("valida o corpo do login", async () => {
      await request(app.getHttpServer()).post("/api/session/login").send({ cpf: "123" }).expect(400);
    });

    it("logout limpa o cookie e esquece o token do cache", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/session/logout")
        .set("Cookie", "lx_reports=token-gestor")
        .expect(204);
      expect(String(res.headers["set-cookie"])).toMatch(/lx_reports=;/);
      expect(identity.forgotten).toEqual(["token-gestor"]);
    });

    it("encaminha o IP do cliente (atrás do proxy) para a API principal", async () => {
      await request(app.getHttpServer())
        .get("/api/session")
        .set(as("token-leitor"))
        .set("X-Forwarded-For", "203.0.113.9")
        .expect(200);
      expect(identity.lastIp).toBe("203.0.113.9");
    });
  });

  describe("acesso", () => {
    it("sem sessão → 401; sessão revogada → 401", async () => {
      await request(app.getHttpServer()).get("/api/reports").expect(401);
      await request(app.getHttpServer()).get("/api/reports").set(as("token-revogado")).expect(401);
    });

    it("sem report:read → 403", async () => {
      await request(app.getHttpServer()).get("/api/analytics/meta").set(as("token-worker")).expect(403);
    });

    it("health é público", async () => {
      await request(app.getHttpServer()).get("/api/health").expect(200, { status: "ok" });
    });
  });

  describe("consultas", () => {
    it("o tenant vem da sessão, nunca do corpo", async () => {
      await request(app.getHttpServer())
        .post("/api/analytics/query")
        .set(as("token-leitor"))
        .send({ dataset: "service_orders", measures: ["order_count"] })
        .expect(200);
      const first = JSON.stringify(executed[0].pipeline[0]);
      expect(first).toContain(COMPANY);

      // Campo extra no corpo é rejeitado, não ignorado em silêncio.
      await request(app.getHttpServer())
        .post("/api/analytics/query")
        .set(as("token-leitor"))
        .send({ dataset: "service_orders", measures: ["order_count"], company: OTHER_COMPANY })
        .expect(400);
      expect(executed).toHaveLength(1);
    });

    it("devolve dados, anotação e colunas", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/analytics/query")
        .set(as("token-leitor"))
        .send({ dataset: "service_orders", measures: ["order_count"] })
        .expect(200);
      expect(res.body.data).toEqual([{ order_count: 3 }]);
      expect(res.body.columns).toEqual(["order_count"]);
      expect(res.body.annotation.order_count).toMatchObject({ title: "Ordens de serviço", format: "integer" });
    });

    it("erro semântico → 400 com o que está disponível", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/analytics/query")
        .set(as("token-leitor"))
        .send({ dataset: "service_orders", measures: ["nao_existe"] })
        .expect(400);
      expect(res.body.error).toBe("unknown-measure");
      expect(res.body.details[0]).toContain("order_count");
    });

    it("catálogo lista os datasets com dimensões e medidas", async () => {
      const res = await request(app.getHttpServer()).get("/api/analytics/meta").set(as("token-leitor")).expect(200);
      expect(res.body.datasets.map((d: { name: string }) => d.name)).toEqual([
        "work_days",
        "time_entries",
        "service_orders",
        "contracts",
        "licits",
      ]);
    });
  });

  describe("relatórios salvos", () => {
    const body = {
      name: "OS por situação",
      category: "Operação",
      visualization: "bar",
      spec: {
        dataset: "service_orders",
        dimensions: ["status"],
        measures: ["order_count", "overdue_count"],
        timeDimension: { dimension: "date_init", range: ["2026-01-01", "2026-01-31"] },
      },
    };

    it("lista os relatórios do sistema", async () => {
      const res = await request(app.getHttpServer()).get("/api/reports").set(as("token-leitor")).expect(200);
      expect(res.body.filter((r: ReportDefinition) => r.system)).toHaveLength(9);
    });

    it("quem só lê não cria (403); quem gerencia cria, sem gravar o período", async () => {
      await request(app.getHttpServer()).post("/api/reports").set(as("token-leitor")).send(body).expect(403);
      const res = await request(app.getHttpServer()).post("/api/reports").set(as("token-gestor")).send(body).expect(201);
      expect(res.body).toMatchObject({
        name: "OS por situação",
        code: "OS",
        system: false,
        usesPeriod: true,
        trend: { measure: "order_count" },
        kpis: { measures: ["order_count", "overdue_count"] },
        createdBy: { name: "Marina Duarte" },
      });
      expect(res.body.spec.timeDimension).toEqual({ dimension: "date_init" });
      expect(reports.rows[0].company).toBe(COMPANY);
    });

    it("rejeita spec que não compila contra o catálogo", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/reports")
        .set(as("token-gestor"))
        .send({ ...body, spec: { dataset: "service_orders", measures: ["inventada"] } })
        .expect(400);
      expect(res.body.message).toContain("inventada");
      expect(reports.rows).toHaveLength(0);
    });

    it("relatório do sistema não é editável nem excluível", async () => {
      await request(app.getHttpServer()).put("/api/reports/sys-frequencia").set(as("token-gestor")).send(body).expect(409);
      await request(app.getHttpServer()).delete("/api/reports/sys-frequencia").set(as("token-gestor")).expect(409);
    });

    it("relatório de outra empresa não aparece nem é excluível", async () => {
      reports.rows.push({ ...(body as unknown as ReportDefinition), id: new ObjectId().toHexString(), system: false, company: OTHER_COMPANY });
      const foreign = reports.rows[0].id;
      await request(app.getHttpServer()).get(`/api/reports/${foreign}`).set(as("token-gestor")).expect(404);
      await request(app.getHttpServer()).delete(`/api/reports/${foreign}`).set(as("token-gestor")).expect(404);
      expect(reports.rows).toHaveLength(1);
    });
  });
});
