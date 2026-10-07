import "dotenv/config";
import { Client } from "pg";
import { applyMigrations } from "./database/migrations";

/** `node dist/migrate-cli.js`: aplica as migrações (pre-deploy do Railway). */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await applyMigrations(client, process.env.DB_SCHEMA);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`[migrate] ${(error as Error).message}`);
  process.exit(1);
});
