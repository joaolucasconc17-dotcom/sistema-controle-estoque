import type { Permission, RoleCode } from "@estoque/shared";

export interface RequestAuth {
  userId: string;
  tenantId: string;
  tenantSlug: string;
  roles: RoleCode[];
  permissions: Permission[];
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: RequestAuth;
  }
}
