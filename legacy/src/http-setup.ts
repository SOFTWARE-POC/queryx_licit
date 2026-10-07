import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { Logger } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { AppConfig } from "./config/app-config";
import { parseTrustProxy } from "./common/http/trust-proxy";

/** Configuração HTTP compartilhada entre `main.ts` e os testes e2e. */
export function configureHttp(app: NestExpressApplication, config: AppConfig): void {
  const logger = new Logger("Http");

  app.set("trust proxy", parseTrustProxy(config.trustProxy));
  app.disable("x-powered-by");
  app.setGlobalPrefix("api");
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'", "data:"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
    }),
  );

  // CORS só pra integrações externas com Bearer (o próprio front é mesma origem).
  if (config.allowedOrigins.length) {
    app.enableCors({ origin: config.allowedOrigins, credentials: false });
  }

  // Front (build do Vite) servido pelo mesmo processo: um deploy só.
  const webDir = resolve(process.cwd(), config.webDir);
  if (existsSync(join(webDir, "index.html"))) {
    const server = app.getHttpAdapter().getInstance() as express.Express;
    server.use("/assets", express.static(join(webDir, "assets"), { immutable: true, maxAge: "365d" }));
    server.use(express.static(webDir, { index: false, maxAge: "1h" }));
    server.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(join(webDir, "index.html"));
    });
  } else {
    logger.warn(`Front não encontrado em ${webDir} — servindo só a API. Rode 'npm run build:web'.`);
  }
}
