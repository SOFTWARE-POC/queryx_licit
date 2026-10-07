/**
 * `trust proxy` do Express a partir de `TRUST_PROXY` (padrão 1 — um proxy na
 * frente, caso do Railway). Sem isso, atrás do proxy todo cliente tem o mesmo IP
 * e o rate limit vira global. Use `false` se o serviço for exposto sem proxy.
 */
export function parseTrustProxy(raw: string | undefined): boolean | number | string {
  const value = raw?.trim();
  if (!value) return 1;
  if (value === "true") return true;
  if (value === "false") return false;
  const hops = Number(value);
  return Number.isInteger(hops) && hops >= 0 ? hops : value;
}
