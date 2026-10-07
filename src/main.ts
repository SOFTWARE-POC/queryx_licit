import "reflect-metadata";
import "dotenv/config";
import "./database/pg-types";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Client } from "pg";
import { AppModule } from "./app.module";
import { loadConfig } from "./config/app-config";
import { applyMigrations } from "./database/migrations";
import { configureHttp } from "./http-setup";

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const logger = new Logger("Bootstrap");

  // Schema do serviço em dia antes de abrir a porta (idempotente, com lock).
  const client = new Client({ connectionString: config.databaseUrl });
  await client.connect();
  try {
    await applyMigrations(client, config.dbSchema, (m) => logger.log(m));
  } finally {
    await client.end();
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  configureHttp(app, config);
  app.enableShutdownHooks();
  await app.listen(config.port, "::");
  logger.log(`Licitta Relatórios ouvindo na porta ${config.port} (fuso ${config.timezone}, e-mail: ${config.mail.provider})`);
}

void bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
