import { Db } from "../../src/database/db";

/**
 * Dados de duas empresas para os testes. Horários em -03:00 (America/Sao_Paulo).
 *
 * Empresa A (setembro/2026):
 *  - Bruno e Carla (time "Campo Norte"), Gil (gestor), Ana (admin), Davi (inativo).
 *  - 5 OS: concluída no prazo, em andamento atrasada, concluída com atraso,
 *    pendente com prazo longe e cancelada.
 *  - Escala ativa de Bruno (seg-sex 08:00-17:00) a partir de 01/09:
 *    01/09 entrada 08:00 (presente), 02/09 08:20 (atraso), 03/09 sem ponto (falta),
 *    04/09 atestado aprovado (abonada).
 * Empresa B: uma pessoa, uma OS e marcações (para testar o isolamento).
 */
export const A = "aaaaaaaa-0000-4000-8000-000000000001";
export const B = "bbbbbbbb-0000-4000-8000-000000000001";

export const ROLE = {
  ADMIN: "a0000000-0000-4000-8000-0000000000a1",
  MANAGER: "a0000000-0000-4000-8000-0000000000a2",
  WORKER: "a0000000-0000-4000-8000-0000000000a3",
};

export const U = {
  ana: "a1000000-0000-4000-8000-000000000001",
  gil: "a1000000-0000-4000-8000-000000000002",
  bruno: "a1000000-0000-4000-8000-000000000003",
  carla: "a1000000-0000-4000-8000-000000000004",
  davi: "a1000000-0000-4000-8000-000000000005",
  beto: "b1000000-0000-4000-8000-000000000001",
};

export const TEAM = "a2000000-0000-4000-8000-000000000001";

export const OS = {
  os1: "a3000000-0000-4000-8000-000000000001",
  os2: "a3000000-0000-4000-8000-000000000002",
  os3: "a3000000-0000-4000-8000-000000000003",
  os4: "a3000000-0000-4000-8000-000000000004",
  os5: "a3000000-0000-4000-8000-000000000005",
  osB: "b3000000-0000-4000-8000-000000000001",
};

const EXEC = {
  e1: "a4000000-0000-4000-8000-000000000001",
  e2: "a4000000-0000-4000-8000-000000000002",
  e3: "a4000000-0000-4000-8000-000000000003",
};

const SCHEDULE = "a5000000-0000-4000-8000-000000000001";
const LICIT = "a6000000-0000-4000-8000-000000000001";
const POP = "a7000000-0000-4000-8000-000000000001";

export const PERMISSIONS = [
  "report:read",
  "report:manage",
  "service-order:read",
  "timeclock:read",
  "absence:read",
  "user:read",
  "audit:read",
  "contract:read",
  "licit:read",
  "pops:read",
];

const ts = (local: string) => `'${local}:00-03'::timestamptz`;

export async function seed(db: Db): Promise<void> {
  const sql = `
    INSERT INTO companies (id, razao_social, password, email, telephone, cep) VALUES
      ('${A}', 'Empresa A', 'x', 'a@a.com', '1', '1'),
      ('${B}', 'Empresa B', 'x', 'b@b.com', '1', '1');

    INSERT INTO roles (id, name, label) VALUES
      ('${ROLE.ADMIN}', 'ADMIN', 'Administrador'),
      ('${ROLE.MANAGER}', 'MANAGER', 'Gestor'),
      ('${ROLE.WORKER}', 'WORKER', 'Funcionário');

    INSERT INTO permissions (key, description)
      SELECT k, k FROM unnest(ARRAY[${PERMISSIONS.map((p) => `'${p}'`).join(", ")}]) AS k;
    -- ADMIN: tudo. MANAGER: ver relatórios de OS e ponto (sem auditoria). WORKER: nada.
    INSERT INTO role_permissions (role_id, permission_id) SELECT '${ROLE.ADMIN}', id FROM permissions;
    INSERT INTO role_permissions (role_id, permission_id)
      SELECT '${ROLE.MANAGER}', id FROM permissions
       WHERE key IN ('report:read', 'service-order:read', 'timeclock:read', 'absence:read');

    INSERT INTO users (id, company_id, role_id, name, password, email, cpf, active) VALUES
      ('${U.ana}', '${A}', '${ROLE.ADMIN}', 'Ana Admin', 'x', 'ana@a.com', '00000000001', true),
      ('${U.gil}', '${A}', '${ROLE.MANAGER}', 'Gil Gestor', 'x', 'gil@a.com', '00000000002', true),
      ('${U.bruno}', '${A}', '${ROLE.WORKER}', 'Bruno Campo', 'x', 'bruno@a.com', '00000000003', true),
      ('${U.carla}', '${A}', '${ROLE.WORKER}', 'Carla Campo', 'x', 'carla@a.com', '00000000004', true),
      ('${U.davi}', '${A}', '${ROLE.MANAGER}', 'Davi Inativo', 'x', 'davi@a.com', '00000000005', false),
      ('${U.beto}', '${B}', '${ROLE.ADMIN}', 'Beto da B', 'x', 'beto@b.com', '00000000006', true);

    -- Gil perdeu absence:read por exceção individual.
    INSERT INTO user_permission_overrides (company_id, user_id, permission_id, granted)
      SELECT '${A}', '${U.gil}', id, false FROM permissions WHERE key = 'absence:read';

    INSERT INTO user_presence (user_id, company_id, status) VALUES
      ('${U.bruno}', '${A}', 'DISPONIVEL'), ('${U.carla}', '${A}', 'AUSENTE'), ('${U.gil}', '${A}', 'DISPONIVEL');

    INSERT INTO teams (id, company_id, name) VALUES ('${TEAM}', '${A}', 'Campo Norte');
    INSERT INTO team_members (company_id, team_id, user_id) VALUES
      ('${A}', '${TEAM}', '${U.bruno}'), ('${A}', '${TEAM}', '${U.carla}');

    INSERT INTO service_orders (id, company_id, type_service, description, date_init, date_prev, completed_at, status,
                                team_id, requested_by, estimated_hours, created_at, fence_lat, fence_lng, fence_radius_m) VALUES
      ('${OS.os1}', '${A}', 'Manutenção', 'Troca de lâmpadas', ${ts("2026-09-02 08:00")}, ${ts("2026-09-05 18:00")},
        ${ts("2026-09-04 10:00")}, 'CONCLUIDA', '${TEAM}', '${U.gil}', 4, ${ts("2026-09-02 07:00")}, -23.5, -46.6, 100),
      ('${OS.os2}', '${A}', 'Limpeza', 'Limpeza de calha', ${ts("2026-09-10 08:00")}, ${ts("2026-09-12 18:00")},
        NULL, 'EM_ANDAMENTO', NULL, '${U.gil}', 2, ${ts("2026-09-10 07:00")}, NULL, NULL, NULL),
      ('${OS.os3}', '${A}', 'Manutenção', 'Reparo elétrico', ${ts("2026-09-15 08:00")}, ${ts("2026-09-16 18:00")},
        ${ts("2026-09-20 10:00")}, 'CONCLUIDA', '${TEAM}', '${U.ana}', 6, ${ts("2026-09-15 07:00")}, NULL, NULL, NULL),
      ('${OS.os4}', '${A}', 'Jardinagem', 'Poda', ${ts("2026-09-20 08:00")}, ${ts("2099-01-01 18:00")},
        NULL, 'PENDENTE', NULL, '${U.gil}', 3, ${ts("2026-09-20 07:00")}, NULL, NULL, NULL),
      ('${OS.os5}', '${A}', 'Limpeza', 'Cancelada', ${ts("2026-09-21 08:00")}, ${ts("2026-09-22 18:00")},
        NULL, 'CANCELADA', NULL, '${U.gil}', 1, ${ts("2026-09-21 07:00")}, NULL, NULL, NULL),
      ('${OS.osB}', '${B}', 'Manutenção', 'Da empresa B', ${ts("2026-09-02 08:00")}, ${ts("2026-09-03 18:00")},
        ${ts("2026-09-03 10:00")}, 'CONCLUIDA', NULL, NULL, 1, ${ts("2026-09-02 07:00")}, NULL, NULL, NULL);

    INSERT INTO service_order_assignees (company_id, service_order_id, user_id, team_id, acceptance, responded_at, decline_reason, created_at) VALUES
      ('${A}', '${OS.os1}', '${U.bruno}', '${TEAM}', 'ACEITA', ${ts("2026-09-02 07:30")}, NULL, ${ts("2026-09-02 07:00")}),
      ('${A}', '${OS.os1}', '${U.carla}', '${TEAM}', 'ACEITA', ${ts("2026-09-02 08:00")}, NULL, ${ts("2026-09-02 07:00")}),
      ('${A}', '${OS.os2}', '${U.bruno}', NULL, 'ACEITA', ${ts("2026-09-10 07:10")}, NULL, ${ts("2026-09-10 07:00")}),
      ('${A}', '${OS.os4}', '${U.carla}', NULL, 'RECUSADA', ${ts("2026-09-20 09:00")}, 'Sem material', ${ts("2026-09-20 07:00")}),
      ('${A}', '${OS.os4}', '${U.bruno}', NULL, 'PENDENTE', NULL, NULL, ${ts("2026-09-20 07:00")});

    INSERT INTO service_execs (id, company_id, service_order_id, executed_by, executed_at, status) VALUES
      ('${EXEC.e1}', '${A}', '${OS.os1}', '${U.bruno}', ${ts("2026-09-03 16:00")}, 'CONCLUIDA'),
      ('${EXEC.e2}', '${A}', '${OS.os3}', '${U.carla}', ${ts("2026-09-17 16:00")}, 'CANCELADA'),
      ('${EXEC.e3}', '${A}', '${OS.os3}', '${U.carla}', ${ts("2026-09-19 16:00")}, 'CONCLUIDA');
    INSERT INTO service_validations (company_id, service_exec_id, validated_by, status, rejected_mot, validated_at) VALUES
      ('${A}', '${EXEC.e1}', '${U.gil}', 'APROVADO', 'NONE', ${ts("2026-09-04 10:00")}),
      ('${A}', '${EXEC.e2}', '${U.ana}', 'REPROVADO', 'Foto escura', ${ts("2026-09-18 10:00")}),
      ('${A}', '${EXEC.e3}', '${U.ana}', 'APROVADO', 'NONE', ${ts("2026-09-20 10:00")});
    INSERT INTO service_order_evidences (company_id, service_order_id, service_exec_id, uploaded_by, mime_type, size_bytes, sha256) VALUES
      ('${A}', '${OS.os1}', '${EXEC.e1}', '${U.bruno}', 'image/jpeg', 10, 'a'),
      ('${A}', '${OS.os1}', '${EXEC.e1}', '${U.bruno}', 'image/jpeg', 10, 'b');

    INSERT INTO service_order_fence_events (company_id, service_order_id, user_id, type, latitude, longitude, distance_m, occurred_at) VALUES
      ('${A}', '${OS.os1}', '${U.bruno}', 'SAIDA', -23.51, -46.6, 300, ${ts("2026-09-03 11:00")}),
      ('${A}', '${OS.os1}', '${U.bruno}', 'RETORNO', -23.5, -46.6, 20, ${ts("2026-09-03 11:30")});

    INSERT INTO service_order_messages (company_id, service_order_id, kind, author_id, author_name, body) VALUES
      ('${A}', '${OS.os1}', 'MENSAGEM', '${U.gil}', 'Gil Gestor', 'Bom dia'),
      ('${A}', '${OS.os1}', 'SISTEMA', NULL, 'Sistema', 'Bruno aceitou a OS.');

    INSERT INTO pops (id, company_id, titulo, descricao, setor, responsavel_id) VALUES
      ('${POP}', '${A}', 'Troca segura de lâmpadas', 'x', 'Elétrica', '${U.gil}');
    INSERT INTO service_order_pops (company_id, service_order_id, pop_id, position) VALUES
      ('${A}', '${OS.os1}', '${POP}', 0), ('${A}', '${OS.os3}', '${POP}', 0);

    -- Ponto: Bruno 01/09 08:00-12:00 + 13:00-17:30 (8,5h); 02/09 08:20-17:00.
    -- Carla: turno noturno 01/09 22:00 → 02/09 06:00 (conta em 01/09) e uma marcação invalidada.
    INSERT INTO time_entries (company_id, user_id, type, timestamp, source, status, original_timestamp, adjusted_by, adjusted_reason, face_confidence) VALUES
      ('${A}', '${U.bruno}', 'CLOCK_IN', ${ts("2026-09-01 08:00")}, 'FACE', 'VALID', NULL, NULL, NULL, 0.9),
      ('${A}', '${U.bruno}', 'CLOCK_OUT', ${ts("2026-09-01 12:00")}, 'API', 'VALID', NULL, NULL, NULL, NULL),
      ('${A}', '${U.bruno}', 'CLOCK_IN', ${ts("2026-09-01 13:00")}, 'API', 'VALID', NULL, NULL, NULL, NULL),
      ('${A}', '${U.bruno}', 'CLOCK_OUT', ${ts("2026-09-01 17:30")}, 'API', 'ADJUSTED', ${ts("2026-09-01 18:30")}, '${U.gil}', 'Esqueceu de bater', NULL),
      ('${A}', '${U.bruno}', 'CLOCK_IN', ${ts("2026-09-02 08:20")}, 'API', 'VALID', NULL, NULL, NULL, NULL),
      ('${A}', '${U.bruno}', 'CLOCK_OUT', ${ts("2026-09-02 17:00")}, 'API', 'VALID', NULL, NULL, NULL, NULL),
      ('${A}', '${U.carla}', 'CLOCK_IN', ${ts("2026-09-01 22:00")}, 'API', 'VALID', NULL, NULL, NULL, NULL),
      ('${A}', '${U.carla}', 'CLOCK_IN', ${ts("2026-09-02 01:00")}, 'API', 'INVALIDATED', NULL, '${U.gil}', 'Duplicada', NULL),
      ('${A}', '${U.carla}', 'CLOCK_OUT', ${ts("2026-09-02 06:00")}, 'API', 'VALID', NULL, NULL, NULL, NULL),
      ('${B}', '${U.beto}', 'CLOCK_IN', ${ts("2026-09-01 08:00")}, 'API', 'VALID', NULL, NULL, NULL, NULL),
      ('${B}', '${U.beto}', 'CLOCK_OUT', ${ts("2026-09-01 20:00")}, 'API', 'VALID', NULL, NULL, NULL, NULL);
    -- Saída da Carla feita sem internet e enviada às 07:40.
    UPDATE time_entries SET offline = true, client_entry_id = 'p-carla-0001', created_at = ${ts("2026-09-02 07:40")}
     WHERE user_id = '${U.carla}' AND type = 'CLOCK_OUT';

    INSERT INTO time_clock_attempts (company_id, user_id, type, accepted, error) VALUES
      ('${A}', '${U.bruno}', 'CLOCK_IN', true, NULL),
      ('${A}', '${U.bruno}', 'CLOCK_IN', false, 'Fora do perímetro');

    INSERT INTO schedules (id, company_id, name, status, shift_type, start_date) VALUES
      ('${SCHEDULE}', '${A}', 'Comercial', 'ACTIVE', 'FULL_DAY', ${ts("2026-09-01 00:00")});
    INSERT INTO schedule_workers (company_id, schedule_id, user_id) VALUES ('${A}', '${SCHEDULE}', '${U.bruno}');
    INSERT INTO schedule_worker_shifts (schedule_id, user_id, position, day, start_time, end_time) VALUES
      ('${SCHEDULE}', '${U.bruno}', 0, 'MONDAY', '08:00', '17:00'),
      ('${SCHEDULE}', '${U.bruno}', 1, 'TUESDAY', '08:00', '17:00'),
      ('${SCHEDULE}', '${U.bruno}', 2, 'WEDNESDAY', '08:00', '17:00'),
      ('${SCHEDULE}', '${U.bruno}', 3, 'THURSDAY', '08:00', '17:00'),
      ('${SCHEDULE}', '${U.bruno}', 4, 'FRIDAY', '08:00', '17:00');

    INSERT INTO absence_requests (company_id, user_id, type, start_date, end_date, reason, status, reviewed_by, reviewed_at, created_at) VALUES
      ('${A}', '${U.bruno}', 'ATESTADO_MEDICO', '2026-09-04', '2026-09-04', 'Consulta', 'APROVADO', '${U.gil}', ${ts("2026-09-04 12:00")}, ${ts("2026-09-04 08:00")}),
      ('${A}', '${U.carla}', 'JUSTIFICATIVA_FALTA', '2026-09-08', '2026-09-08', 'Ônibus', 'PENDENTE', NULL, NULL, ${ts("2026-09-08 09:00")});

    INSERT INTO licits (id, company_id, number_licit, org, modality, value_estim, status) VALUES
      ('${LICIT}', '${A}', 'PE-01/2026', 'Prefeitura X', 'Pregão', 100000, 'OPEN');
    INSERT INTO contracts (company_id, licit_id, num_contract, date_init, date_end, status, price_contract) VALUES
      ('${A}', '${LICIT}', 'CT-01', ${ts("2026-01-01 00:00")}, ${ts("2099-12-31 00:00")}, 'ACTIVE', 80000),
      ('${A}', '${LICIT}', 'CT-02', ${ts("2025-01-01 00:00")}, ${ts("2026-01-01 00:00")}, 'ACTIVE', 20000);

    INSERT INTO audit_log (company_id, actor_id, actor_name, entity, entity_id, action, created_at) VALUES
      ('${A}', '${U.gil}', 'Gil Gestor', 'service_order', '${OS.os1}', 'CREATE', ${ts("2026-09-02 07:00")}),
      ('${A}', '${U.gil}', 'Gil Gestor', 'service_order', '${OS.os1}', 'UPDATE', ${ts("2026-09-04 10:00")});
    INSERT INTO access_logs (company_id, user_id, event, ip, created_at) VALUES
      ('${A}', '${U.gil}', 'LOGIN_OK', '10.0.0.1', ${ts("2026-09-02 06:50")}),
      ('${A}', '${U.gil}', 'LOGIN_FAIL', '10.0.0.1', ${ts("2026-09-02 06:49")});
  `;
  for (const stmt of sql.split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean)) {
    await db.query(stmt);
  }
}
