import { PERMISSIONS, type Permission, type RoleCode } from "@estoque/shared";

/**
 * Mapa fixo perfil -> permissoes, usado ao semear um tenant novo.
 * A autorizacao em runtime SEMPRE verifica a permissao (ver requirePermission
 * em platform/http/authorize.ts) — este mapa so decide o que cada perfil
 * ganha no momento em que os perfis sao criados.
 */
export const ROLE_PERMISSIONS: Record<RoleCode, Permission[]> = {
  // Dono da empresa cliente: tudo, incluindo gerenciar outros usuarios e perfis.
  OWNER: [...PERMISSIONS],

  // Administrador operacional: tudo, exceto o que fica reservado ao dono.
  ADMIN: PERMISSIONS.filter((p) => p !== "iam.role.manage"),

  GERENTE_ESTOQUE: [
    "catalog.product.read",
    "catalog.product.write",
    "catalog.supplier.read",
    "catalog.supplier.write",
    "catalog.reference.write",
    "org.manage",
    "inventory.movement.create",
    "inventory.movement.reverse",
    "inventory.balance.read",
    "inventory.count.execute",
    "inventory.count.approve",
    "purchasing.order.create",
    "purchasing.order.approve",
    "purchasing.receipt.create",
    "reports.read",
  ],

  OPERADOR: [
    "catalog.product.read",
    "inventory.movement.create",
    "inventory.balance.read",
    "inventory.count.execute",
    "purchasing.receipt.create",
  ],

  LEITURA: [
    "catalog.product.read",
    "catalog.supplier.read",
    "inventory.balance.read",
    "reports.read",
  ],
};
