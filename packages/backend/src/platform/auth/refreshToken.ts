import { randomBytes, createHash } from "node:crypto";

/**
 * Refresh token opaco (nao-JWT): "<tenantId>.<segredo aleatorio>". O prefixo
 * de tenantId deixa o servidor saber qual banco consultar ANTES de decodificar
 * nada — o segredo em si nunca e persistido, apenas seu hash SHA-256.
 */
export function generateRefreshToken(tenantId: string): { token: string; hash: string } {
  const secret = randomBytes(32).toString("hex");
  const token = `${tenantId}.${secret}`;
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function parseTenantIdFromRefreshToken(token: string): string | null {
  const [tenantId] = token.split(".");
  return tenantId || null;
}
