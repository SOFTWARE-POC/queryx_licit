import { INestApplication } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { ANALYTICS_DB } from "../../src/analytics/application/analytics.service";
import { IDENTITY_PROVIDER, Principal } from "../../src/auth/auth";
import { DB } from "../../src/database/db";
import { Mailer, MAILER, MailMessage } from "../../src/delivery/application/ports";
import { SchedulesService } from "../../src/delivery/application/schedules.service";
import { configureHttp } from "../../src/http-setup";
import { createTestDb, TestDb } from "./db";
import { A, B, PERMISSIONS, seed, U } from "./seed";

export class CaptureMailer implements Mailer {
  enabled = true;
  sent: MailMessage[] = [];
  async send(m: MailMessage) {
    this.sent.push(m);
  }
}

/** Tokens de teste → usuários (o que a API principal devolveria em /auth/me). */
export const TOKENS: Record<string, Principal> = {
  ana: { userId: U.ana, name: "Ana Admin", companyId: A, permissions: PERMISSIONS },
  // Gestor: vê relatórios de OS/ponto/abonos, mas não gerencia nem vê auditoria.
  gil: {
    userId: U.gil,
    name: "Gil Gestor",
    companyId: A,
    permissions: ["report:read", "service-order:read", "timeclock:read"],
  },
  bruno: { userId: U.bruno, name: "Bruno Campo", companyId: A, permissions: [] },
  beto: { userId: U.beto, name: "Beto da B", companyId: B, permissions: PERMISSIONS },
};

export interface Harness {
  app: INestApplication;
  db: TestDb;
  mailer: CaptureMailer;
  schedules: SchedulesService;
  http(token?: keyof typeof TOKENS): {
    get(path: string): request.Test;
    post(path: string, body?: unknown): request.Test;
    put(path: string, body?: unknown): request.Test;
    delete(path: string): request.Test;
  };
  close(): Promise<void>;
}

export async function createHarness(): Promise<Harness> {
  process.env.DATABASE_URL = "postgres://nao-usado";
  process.env.MAIN_API_URL = "http://api-principal.test";
  process.env.SCHEDULER_ENABLED = "false";
  process.env.PANEL_URL = "https://painel.test";

  const db = await createTestDb();
  await seed(db.db);
  const mailer = new CaptureMailer();

  // Importado depois do env: o AppModule lê a configuração ao montar.
  const { AppModule } = await import("../../src/app.module");
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DB)
    .useValue(db.db)
    .overrideProvider(ANALYTICS_DB)
    .useValue(db.db)
    .overrideProvider(MAILER)
    .useValue(mailer)
    .overrideProvider(IDENTITY_PROVIDER)
    .useValue({ resolve: async (token: string) => TOKENS[token] ?? null })
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false, bodyParser: false });
  configureHttp(app, { trustProxy: undefined });
  await app.init();
  const server = app.getHttpServer();

  const http = (token?: string) => {
    const auth = (t: request.Test) => (token ? t.set("Authorization", `Bearer ${token}`) : t);
    return {
      get: (p: string) => auth(request(server).get(`/api${p}`)),
      post: (p: string, body?: unknown) => auth(request(server).post(`/api${p}`)).send(body as object),
      put: (p: string, body?: unknown) => auth(request(server).put(`/api${p}`)).send(body as object),
      delete: (p: string) => auth(request(server).delete(`/api${p}`)),
    };
  };

  return {
    app,
    db,
    mailer,
    schedules: app.get(SchedulesService),
    http,
    close: async () => {
      await app.close();
      await db.close();
    },
  };
}

/** Corpo binário (xlsx) no supertest. */
export const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};
