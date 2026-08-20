import type { PrismaClient as TenantPrismaClient } from "../../generated/tenant/index.js";
import { PERMISSIONS, ROLE_CODES } from "@estoque/shared";
import { ROLE_PERMISSIONS } from "../../modules/iam/rolePermissions.js";
import { hashPassword } from "../auth/password.js";

const DEFAULT_UNITS_OF_MEASURE = [
  { code: "UN", name: "Unidade" },
  { code: "CX", name: "Caixa" },
  { code: "KG", name: "Quilograma" },
  { code: "L", name: "Litro" },
  { code: "M", name: "Metro" },
];

/**
 * Semeia um banco de tenant recem-criado: permissoes, perfis padrao,
 * unidades de medida basicas e o usuario owner. Roda uma unica vez por
 * empresa, logo apos a migration inicial.
 */
export async function seedTenantData(
  db: TenantPrismaClient,
  owner: { name: string; email: string; password: string },
): Promise<void> {
  await db.$transaction(async (tx) => {
    // Permissoes: todo o catalogo fixo definido em @estoque/shared.
    for (const code of PERMISSIONS) {
      await tx.permission.upsert({
        where: { code },
        create: { code },
        update: {},
      });
    }

    // Perfis + vinculo com permissoes.
    for (const roleCode of ROLE_CODES) {
      const role = await tx.role.upsert({
        where: { code: roleCode },
        create: { code: roleCode, name: roleCode },
        update: {},
      });

      const permissionCodes = ROLE_PERMISSIONS[roleCode];
      const permissions = await tx.permission.findMany({
        where: { code: { in: permissionCodes } },
      });
      for (const permission of permissions) {
        await tx.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
          create: { roleId: role.id, permissionId: permission.id },
          update: {},
        });
      }
    }

    for (const uom of DEFAULT_UNITS_OF_MEASURE) {
      await tx.unitOfMeasure.upsert({
        where: { code: uom.code },
        create: uom,
        update: {},
      });
    }

    const ownerRole = await tx.role.findUniqueOrThrow({ where: { code: "OWNER" } });
    const passwordHash = await hashPassword(owner.password);
    await tx.user.upsert({
      where: { email: owner.email.toLowerCase() },
      create: {
        name: owner.name,
        email: owner.email.toLowerCase(),
        passwordHash,
        roles: { create: [{ roleId: ownerRole.id }] },
      },
      update: {},
    });
  });
}
