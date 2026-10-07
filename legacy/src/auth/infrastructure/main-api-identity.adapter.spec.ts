import http from "node:http";
import { AddressInfo } from "node:net";
import { loadConfig } from "../../config/app-config";
import { AppError } from "../../common/errors";
import { MainApiIdentityAdapter } from "./main-api-identity.adapter";

const exp = Math.floor(Date.now() / 1000) + 3600;
const TOKEN = `h.${Buffer.from(JSON.stringify({ userId: "u1", exp })).toString("base64url")}.s`;
const USER = {
  id: "u1",
  name: "Marina",
  email: "m@x.com",
  company: { id: "c1", razaoSocial: "Empresa A" },
  role: { name: "ADMIN", permissions: ["report:read"] },
};

describe("MainApiIdentityAdapter (contra um servidor HTTP real)", () => {
  let server: http.Server;
  let calls: Array<{ url: string; xff?: string; auth?: string }>;
  let meStatus: number;
  let adapter: MainApiIdentityAdapter;

  beforeEach(async () => {
    calls = [];
    meStatus = 200;
    server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        calls.push({ url: req.url!, xff: req.headers["x-forwarded-for"] as string, auth: req.headers.authorization });
        res.setHeader("Content-Type", "application/json");
        if (req.url === "/auth/login") {
          const b = JSON.parse(body);
          if (b.password !== "ok") {
            res.statusCode = 401;
            res.end(JSON.stringify({ message: "Credenciais inválidas" }));
            return;
          }
          res.end(JSON.stringify({ data: { token: TOKEN, user: USER } }));
          return;
        }
        res.statusCode = meStatus;
        res.end(JSON.stringify(meStatus === 200 ? { data: USER } : { message: "Sessão encerrada. Faça login novamente." }));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;
    adapter = new MainApiIdentityAdapter(
      loadConfig({ MONGODB_URI: "mongodb://x", MAIN_API_URL: `http://127.0.0.1:${port}/`, AUTH_CACHE_TTL_SECONDS: "15" }),
    );
  });

  afterEach(() => new Promise((r) => server.close(r)));

  it("login: devolve token, perfil mapeado e a expiração do JWT", async () => {
    const result = await adapter.login("11111111111", "ok", "203.0.113.5");
    expect(result.token).toBe(TOKEN);
    expect(result.principal).toEqual({
      userId: "u1",
      name: "Marina",
      email: "m@x.com",
      companyId: "c1",
      companyName: "Empresa A",
      roleName: "ADMIN",
      permissions: ["report:read"],
    });
    expect(result.expiresAt?.getTime()).toBe(exp * 1000);
    expect(calls[0].xff).toBe("203.0.113.5");
  });

  it("login recusado repassa a mensagem da API principal", async () => {
    await expect(adapter.login("11111111111", "errada")).rejects.toMatchObject({ kind: "unauthenticated", message: "Credenciais inválidas" });
  });

  it("introspect usa cache por token e forget o invalida", async () => {
    await adapter.introspect(TOKEN, "203.0.113.5");
    await adapter.introspect(TOKEN);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: "/auth/me", auth: `Bearer ${TOKEN}`, xff: "203.0.113.5" });
    adapter.forget(TOKEN);
    await adapter.introspect(TOKEN);
    expect(calls).toHaveLength(2);
  });

  it("sessão revogada na API principal vira 401 aqui, sem ir pro cache", async () => {
    meStatus = 401;
    await expect(adapter.introspect(TOKEN)).rejects.toMatchObject({ kind: "unauthenticated", message: "Sessão encerrada. Faça login novamente." });
    meStatus = 200;
    await adapter.introspect(TOKEN);
    expect(calls).toHaveLength(2);
  });

  it("API principal fora do ar → unavailable", async () => {
    await new Promise((r) => server.close(r));
    const err = await adapter.introspect("outro").catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.kind).toBe("unavailable");
    server = http.createServer().listen(0);
  });
});
