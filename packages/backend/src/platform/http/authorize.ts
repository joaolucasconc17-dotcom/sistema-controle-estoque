import type { FastifyReply, FastifyRequest } from "fastify";
import type { Permission } from "@estoque/shared";
import { AppError } from "../errors.js";
import "./types.js";

/** preHandler factory: exige que o usuario autenticado tenha a permissao informada. */
export function requirePermission(permission: Permission) {
  return async function permissionGuard(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!request.auth) throw AppError.unauthorized();
    if (!request.auth.permissions.includes(permission)) {
      throw AppError.forbidden(`Permissao necessaria: ${permission}`);
    }
  };
}
