import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { APP_CONFIG, AppConfig } from "./config/app-config";
import { configureHttp } from "./http-setup";

async function bootstrap(): Promise<void> {
  // bodyParser: false — o parser com limite é registrado em configureHttp.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const config = app.get<AppConfig>(APP_CONFIG);
  configureHttp(app, config);
  app.enableShutdownHooks();
  await app.listen(config.port, "0.0.0.0");
  new Logger("Bootstrap").log(`LICITA+ Relatórios ouvindo na porta ${config.port}`);
}

void bootstrap();
