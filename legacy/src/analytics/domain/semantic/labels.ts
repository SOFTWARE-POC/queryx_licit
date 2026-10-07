/** Rótulos dos enums gravados pela API principal (valores = schema real). */
export const SERVICE_ORDER_STATUS = {
  PENDENTE: "Pendente",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

export const TIME_ENTRY_TYPE = { CLOCK_IN: "Entrada", CLOCK_OUT: "Saída" };

export const TIME_ENTRY_STATUS = {
  VALID: "Válida",
  ADJUSTED: "Ajustada",
  INVALIDATED: "Invalidada",
};

export const TIME_ENTRY_SOURCE = {
  API: "App",
  MANUAL: "Manual",
  FACE: "Reconhecimento facial",
};

export const CONTRACT_STATUS = { ACTIVE: "Ativo", INACTIVE: "Inativo" };

export const LICIT_STATUS = { OPEN: "Aberta", FINISH: "Finalizada" };
