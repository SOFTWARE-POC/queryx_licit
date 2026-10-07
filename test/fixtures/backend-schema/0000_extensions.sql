-- Extensões usadas pelo schema. Precisa rodar antes da migration que cria os
-- índices trigram (`gin_trgm_ops`) do catálogo CBO.
-- `gen_random_uuid()` é nativo desde o Postgres 13, não precisa de pgcrypto.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
