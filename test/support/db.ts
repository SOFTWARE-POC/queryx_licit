import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Extension, PGlite } from "@electric-sql/pglite";
import { Db } from "../../src/database/db";
import { applyMigrations } from "../../src/database/migrations";

// `require`: o tsconfig (moduleResolution node) não resolve subpaths de `exports`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { pg_trgm } = require("@electric-sql/pglite/contrib/pg_trgm") as { pg_trgm: Extension };

const SCHEMA_DIR = join(__dirname, "..", "fixtures", "backend-schema");

/** PGlite atendendo a interface `Db` do serviço. */
export function pgliteDb(pg: PGlite): Db {
  return {
    query: async (text, params) => {
      const res = await pg.query(text, params as unknown[] | undefined);
      return { rows: res.rows as never[] };
    },
  };
}

export interface TestDb {
  pg: PGlite;
  db: Db;
  close(): Promise<void>;
}

/**
 * Postgres em memória com o schema da API principal (as migrations copiadas
 * por `npm run sync:backend-schema`) e o schema do serviço de relatórios.
 */
export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite({ extensions: { pg_trgm } });
  for (const file of readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    await pg.exec(readFileSync(join(SCHEMA_DIR, file), "utf8"));
  }
  const db = pgliteDb(pg);
  await applyMigrations(db, "relatorios", () => undefined);
  return { pg, db, close: () => pg.close() };
}
