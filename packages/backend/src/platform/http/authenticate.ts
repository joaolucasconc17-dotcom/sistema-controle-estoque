import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../errors.js";
import { verifyAccessToken } from "../auth/jwt.js";
import { tenantConnectionManager } from "../tenant/TenantConnectionManager.js";
import { runInTenantStore } from "../tenant/tenantContext.js";
import "./types.js";

function extractBearerToken(request: FastifyRequest): string {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw AppError.unauthorized();
  return header.slice("Bearer ".length);
}

/**
 * preHandler global: verifica o JWT, entra no contexto do tenant (abrindo/
 * reusando o PrismaClient daquela empresa) e decora `request.auth`. Todo
 * handler que roda depois deste ja pode chamar tenantDb() livremente.
 *
 * Escrito no estilo CALLBACK do Fastify `(request, reply, done)` de
 * proposito, nao async/await — ver o comentario em
 * `runInTenantStore` (tenantContext.ts) para o motivo.
 */
export function authenticate(request: FastifyRequest, _reply: FastifyReply, done: (err?: Error) => void): void {
  let payload;
  try {
    const token = extractBearerToken(request);
    payload = verifyAccessToken(token);
  } catch {
    done(AppError.unauthorized("Token invalido ou expirado"));
    return;
  }

  tenantConnectionManager
    .getClient(payload.tenantId)
    .then((db) => {
      request.auth = {
        userId: payload.sub,
        tenantId: payload.tenantId,
        tenantSlug: payload.tenantSlug,
        roles: payload.roles,
        permissions: payload.permissions,
      };
      runInTenantStore(
        { tenantId: payload.tenantId, tenantSlug: payload.tenantSlug, userId: payload.sub, db },
        () => done(),
      );
    })
    .catch((err: unknown) => done(err instanceof Error ? err : new Error(String(err))));
}
