/** Quem está usando o serviço — sempre resolvido pela API principal, nunca pelo cliente. */
export interface Principal {
  userId: string;
  name: string;
  email: string;
  companyId: string;
  companyName: string;
  roleName: string;
  permissions: string[];
}

/** Permissões do catálogo da API principal usadas por este serviço. */
export const ReportPermission = {
  /** Ver e executar relatórios (inclui os personalizados da empresa). */
  READ: "report:read",
  /** Criar, editar e excluir relatórios personalizados da empresa. */
  MANAGE: "report:manage",
} as const;
export type ReportPermission = (typeof ReportPermission)[keyof typeof ReportPermission];

export function hasPermission(principal: Principal, permission: string): boolean {
  return principal.permissions.includes(permission);
}
