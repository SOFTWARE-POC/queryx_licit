-- Trilhas de auditoria são somente acréscimo (LIC-35/LIC-36): nenhuma linha pode
-- ser alterada nem apagada, nem por SQL direto. INSERT não é afetado.
CREATE OR REPLACE FUNCTION forbid_update_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% é somente acréscimo: % não é permitido', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER access_logs_append_only
  BEFORE UPDATE OR DELETE ON access_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER access_logs_no_truncate
  BEFORE TRUNCATE ON access_logs
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER time_entry_adjustments_append_only
  BEFORE UPDATE OR DELETE ON time_entry_adjustments
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER time_entry_adjustments_no_truncate
  BEFORE TRUNCATE ON time_entry_adjustments
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER time_clock_attempts_append_only
  BEFORE UPDATE OR DELETE ON time_clock_attempts
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER time_clock_attempts_no_truncate
  BEFORE TRUNCATE ON time_clock_attempts
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_update_delete();
