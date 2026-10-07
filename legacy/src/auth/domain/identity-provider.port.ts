import { Principal } from "./principal";

export interface LoginResult {
  token: string;
  principal: Principal;
  /** Expiração do token (quando o emissor informa). */
  expiresAt: Date | null;
}

/**
 * Port: quem autentica e diz quem é o usuário. Implementado pela API principal —
 * este serviço não verifica JWT sozinho, pra respeitar revogação de sessão,
 * usuário inativo e permissões atualizadas na hora.
 */
export interface IdentityProviderPort {
  /** Resolve a sessão de um token. Lança AppError('unauthenticated') se não vale. */
  introspect(token: string, clientIp?: string): Promise<Principal>;
  login(cpf: string, password: string, clientIp?: string): Promise<LoginResult>;
  /** Esquece o token do cache local (logout). */
  forget(token: string): void;
}

export const IDENTITY_PROVIDER = Symbol("IDENTITY_PROVIDER");
