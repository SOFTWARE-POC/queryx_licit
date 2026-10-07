/** Rótulos dos valores gravados pela API principal (os valores são os do schema). */

export const YES_NO = { true: "Sim", false: "Não" };

export const SERVICE_ORDER_STATUS = {
  PENDENTE: "Pendente",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

export const ACCEPTANCE = {
  PENDENTE: "Aguardando resposta",
  ACEITA: "Aceita",
  RECUSADA: "Recusada",
};

export const EXEC_STATUS = {
  PENDENTE: "Pendente",
  EM_EXECUCAO: "Em execução",
  CONCLUIDA: "Concluída",
  CANCELADA: "Devolvida para ajuste",
};

export const REVIEW_RESULT = {
  APROVADO: "Aprovada",
  REPROVADO: "Ajuste pedido",
  AGUARDANDO: "Aguardando avaliação",
};

export const FENCE_EVENT = { SAIDA: "Saída da cerca", RETORNO: "Retorno à cerca" };

export const TIME_ENTRY_TYPE = { CLOCK_IN: "Entrada", CLOCK_OUT: "Saída" };

export const TIME_ENTRY_STATUS = { VALID: "Válida", ADJUSTED: "Ajustada", INVALIDATED: "Invalidada" };

export const TIME_ENTRY_SOURCE = { API: "App", MANUAL: "Manual", FACE: "Reconhecimento facial" };

export const ATTENDANCE = {
  PRESENTE: "Presente",
  ATRASO: "Com atraso",
  FALTA: "Falta",
  ABONADA: "Falta abonada",
};

export const WEEKDAY = {
  "1": "Segunda",
  "2": "Terça",
  "3": "Quarta",
  "4": "Quinta",
  "5": "Sexta",
  "6": "Sábado",
  "7": "Domingo",
};

export const ABSENCE_TYPE = {
  ATESTADO_MEDICO: "Atestado médico",
  JUSTIFICATIVA_FALTA: "Justificativa de falta",
  SOLICITACAO_AUSENCIA: "Ausência programada",
  OUTRO: "Outro",
};

export const ABSENCE_STATUS = {
  PENDENTE: "Pendente",
  APROVADO: "Aprovado",
  REJEITADO: "Rejeitado",
  CANCELADO: "Cancelado",
};

export const PRESENCE = { DISPONIVEL: "Disponível", AUSENTE: "Ausente", OFFLINE: "Offline" };

export const CONTRACT_STATUS = { ACTIVE: "Ativo", INACTIVE: "Inativo" };

export const LICIT_STATUS = { OPEN: "Aberta", FINISH: "Finalizada" };

export const AUDIT_ACTION = { CREATE: "Criação", UPDATE: "Alteração", DELETE: "Exclusão" };

export const AUDIT_ENTITY = {
  service_order: "Ordem de serviço",
  contract: "Contrato",
  licit: "Licitação",
  user: "Usuário",
  role: "Perfil",
  role_permissions: "Permissões de perfil",
  user_permissions: "Permissões de usuário",
  time_entry: "Marcação de ponto",
};

export const ACCESS_EVENT = {
  LOGIN_OK: "Login",
  LOGIN_FAIL: "Login recusado",
  FACE_LOGIN_OK: "Login facial",
  FACE_LOGIN_FAIL: "Login facial recusado",
  LOGOUT: "Saída",
  TOKEN_REVOKED: "Sessão revogada",
};
