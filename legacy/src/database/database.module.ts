import { Global, Inject, Logger, Module, OnApplicationShutdown } from "@nestjs/common";
import { Db, MongoClient } from "mongodb";
import { APP_CONFIG, AppConfig } from "../config/app-config";

export const MONGO_CLIENT = Symbol("MONGO_CLIENT");
export const MONGO_DB = Symbol("MONGO_DB");

/**
 * Driver nativo, sem Mongoose: o serviço só lê as collections da API principal
 * (e grava as próprias definições de relatório). Recomendado: um usuário do banco
 * só com leitura nas collections de negócio e `readPreference=secondaryPreferred`
 * na URI, pra relatório pesado não disputar o primário.
 */
@Global()
@Module({
  providers: [
    {
      provide: MONGO_CLIENT,
      inject: [APP_CONFIG],
      useFactory: async (config: AppConfig) => {
        const client = new MongoClient(config.mongodbUri, {
          appName: "licita-reports",
          serverSelectionTimeoutMS: 10_000,
        });
        await client.connect();
        return client;
      },
    },
    {
      provide: MONGO_DB,
      inject: [MONGO_CLIENT, APP_CONFIG],
      useFactory: (client: MongoClient, config: AppConfig): Db => client.db(config.mongodbDb),
    },
  ],
  exports: [MONGO_CLIENT, MONGO_DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(@Inject(MONGO_CLIENT) private readonly client: MongoClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.close();
    this.logger.log("Conexão com o MongoDB encerrada.");
  }
}
