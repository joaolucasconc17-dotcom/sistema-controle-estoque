/**
 * Enums de dominio compartilhados entre backend e frontend.
 * Espelham os enums do schema Prisma do tenant plane — mudar um lado sem o
 * outro quebra a compilacao, o que e o comportamento desejado.
 */

export const ROLE_CODES = [
  "OWNER",
  "ADMIN",
  "GERENTE_ESTOQUE",
  "OPERADOR",
  "LEITURA",
] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

/**
 * Permissoes granulares. Perfis (roles) sao apenas agrupamentos destas —
 * autorizacao real sempre verifica a permissao, nunca o nome do perfil.
 */
export const PERMISSIONS = [
  "catalog.product.read",
  "catalog.product.write",
  "catalog.product.delete",
  "catalog.supplier.read",
  "catalog.supplier.write",
  // Categoria e unidade de medida sao dados de referencia de baixo risco —
  // leitura e livre para qualquer usuario autenticado, so a escrita e presa.
  "catalog.reference.write",
  // Estrutura organizacional (filiais, depositos, enderecos). Leitura livre,
  // escrita reservada a quem administra a operacao.
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
  "iam.user.manage",
  "iam.role.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const STOCK_MOVEMENT_TYPES = [
  "ENTRADA",
  "SAIDA",
  "TRANSFERENCIA_SAIDA",
  "TRANSFERENCIA_ENTRADA",
  "AJUSTE_POSITIVO",
  "AJUSTE_NEGATIVO",
  "ESTORNO",
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const TRACKING_MODES = ["NONE", "BATCH", "SERIAL"] as const;
export type TrackingMode = (typeof TRACKING_MODES)[number];

export const RESERVATION_STATUSES = [
  "ACTIVE",
  "FULFILLED",
  "CANCELLED",
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const PURCHASE_ORDER_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "CANCELLED",
] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export const TENANT_STATUSES = [
  "PROVISIONING",
  "ACTIVE",
  "SUSPENDED",
  "DEACTIVATED",
] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];
