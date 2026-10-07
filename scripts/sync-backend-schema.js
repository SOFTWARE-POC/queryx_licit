#!/usr/bin/env node
/**
 * Copia as migrations da API principal (../backend/drizzle) para
 * test/fixtures/backend-schema. Os testes sobem um Postgres em memória com
 * exatamente esse schema, então rode isto quando a API ganhar migration nova
 * que mexa em tabela usada pelos relatórios.
 *
 *   npm run sync:backend-schema [-- caminho/para/backend]
 */
const fs = require('fs');
const path = require('path');

const backend = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'backend'));
const src = path.join(backend, 'drizzle');
const dest = path.join(__dirname, '..', 'test', 'fixtures', 'backend-schema');
if (!fs.existsSync(src)) {
  console.error(`Não achei ${src}`);
  process.exit(1);
}
fs.mkdirSync(dest, { recursive: true });
for (const f of fs.readdirSync(dest)) if (f.endsWith('.sql')) fs.unlinkSync(path.join(dest, f));
const files = fs.readdirSync(src).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
for (const f of files) fs.copyFileSync(path.join(src, f), path.join(dest, f));
console.log(`${files.length} migrations copiadas para ${dest}`);
