-- Diário de bordo é somente acréscimo (art. 117 §1º da Lei 14.133 + e-ARQ Brasil):
-- nenhuma entrada pode ser alterada nem apagada, nem por fora da API. Correção é
-- uma entrada NOVA com corrects_entry_id apontando para a original (INSERT, que
-- este trigger não toca).
CREATE OR REPLACE FUNCTION logbook_entries_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'logbook_entries é somente acréscimo: % não é permitido', TG_OP
    USING ERRCODE = 'restrict_violation',
          HINT = 'Para corrigir, registre uma nova entrada com corrects_entry_id.';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER logbook_entries_no_update_delete
  BEFORE UPDATE OR DELETE ON logbook_entries
  FOR EACH ROW EXECUTE FUNCTION logbook_entries_append_only();
--> statement-breakpoint
CREATE TRIGGER logbook_entries_no_truncate
  BEFORE TRUNCATE ON logbook_entries
  FOR EACH STATEMENT EXECUTE FUNCTION logbook_entries_append_only();
