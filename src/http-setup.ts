import { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { parseTrustProxy } from "./common/http/trust-proxy";
import { AppConfig } from "./config/app-config";

/**
 * HTTP compartilhado entre `main.ts` e os testes. O serviço só é chamado pelo
 * proxy `/bi` da API principal (rede privada), por isso sem CORS.
 */
export function configureHttp(app: NestExpressApplication, config: Pick<AppConfig, "trustProxy">): void {
  app.set("trust proxy", parseTrustProxy(config.trustProxy));
  app.disable("x-powered-by");
  app.setGlobalPrefix("api");
  app.useBodyParser("json", { limit: "200kb" });
  app.use(helmet());
}
