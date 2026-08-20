import { getTenantContext } from "../../platform/tenant/tenantContext.js";

/**
 * Grava uma linha em audit_log dentro do banco do tenant atual. Chamado
 * pelos services de negocio depois de criar/alterar/excluir algo sensivel
 * (preco, estoque, permissao). `before`/`after` recebem o registro inteiro
 * (ou so os campos que mudaram) — null quando nao se aplica (ex.: create
 * nao tem `before`, delete nao tem `after`).
 */
export async function writeAudit(params: {
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  const ctx = getTenantContext();
  await ctx.db.auditLog.create({
    data: {
      userId: ctx.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      before: params.before === undefined ? undefined : (params.before as object),
      after: params.after === undefined ? undefined : (params.after as object),
    },
  });
}
