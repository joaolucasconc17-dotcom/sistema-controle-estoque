import type { StartInventoryCountInput, SubmitCountItemInput } from "@estoque/shared";
import { tenantDb } from "../../platform/tenant/tenantContext.js";
import { AppError } from "../../platform/errors.js";
import { toDecimal } from "./stockMath.js";
import { stockLedgerService } from "./StockLedgerService.js";

export class InventoryCountService {
  async start(input: StartInventoryCountInput) {
    const warehouse = await tenantDb().warehouse.findUnique({ where: { id: input.warehouseId } });
    if (!warehouse) throw AppError.validation("Deposito invalido");

    const productIds =
      input.productIds ??
      (
        await tenantDb().stockBalance.findMany({
          where: { warehouseId: input.warehouseId, quantity: { gt: 0 } },
          select: { productId: true },
          distinct: ["productId"],
        })
      ).map((r) => r.productId);

    if (productIds.length === 0) throw AppError.validation("Nenhum produto para contar neste deposito");

    // Congela o esperado somando os saldos de TODOS os lotes do produto
    // neste deposito — a contagem em si e por produto, nao por lote.
    const balances = await tenantDb().stockBalance.groupBy({
      by: ["productId"],
      where: { warehouseId: input.warehouseId, productId: { in: productIds } },
      _sum: { quantity: true },
    });
    const expectedByProduct = new Map(balances.map((b) => [b.productId, b._sum.quantity ?? toDecimal(0)]));

    return tenantDb().inventoryCount.create({
      data: {
        warehouseId: input.warehouseId,
        name: input.name,
        items: {
          create: productIds.map((productId) => ({
            productId,
            expectedQuantity: expectedByProduct.get(productId) ?? toDecimal(0),
          })),
        },
      },
      include: { items: true },
    });
  }

  async submitItem(countId: string, input: SubmitCountItemInput) {
    const count = await tenantDb().inventoryCount.findUnique({ where: { id: countId } });
    if (!count) throw AppError.notFound("Contagem nao encontrada");
    if (count.status === "RECONCILED" || count.status === "CANCELLED") {
      throw AppError.conflict(`Contagem ja esta ${count.status}`);
    }

    const item = await tenantDb().inventoryCountItem.findUnique({
      where: { inventoryCountId_productId: { inventoryCountId: countId, productId: input.productId } },
    });
    if (!item) throw AppError.validation("Este produto nao faz parte desta contagem");

    await tenantDb().inventoryCount.update({
      where: { id: countId },
      data: { status: "COUNTING" },
    });

    return tenantDb().inventoryCountItem.update({
      where: { id: item.id },
      data: { countedQuantity: toDecimal(input.countedQuantity), countedAt: new Date() },
    });
  }

  /**
   * Fecha a contagem: para cada item ja contado com divergencia, gera um
   * movimento de AJUSTE (via StockLedgerService — cada chamada abre sua
   * PROPRIA transacao, de proposito, para nao aninhar transacoes). Itens
   * nunca contados sao ignorados (contagem parcial e permitida).
   */
  async reconcile(countId: string, userId: string) {
    const count = await tenantDb().inventoryCount.findUnique({ where: { id: countId }, include: { items: true } });
    if (!count) throw AppError.notFound("Contagem nao encontrada");
    if (count.status === "RECONCILED" || count.status === "CANCELLED") {
      throw AppError.conflict(`Contagem ja esta ${count.status}`);
    }

    const adjustments = [];
    for (const item of count.items) {
      if (item.countedQuantity === null) continue;
      const divergence = item.countedQuantity.minus(item.expectedQuantity);
      if (divergence.isZero()) continue;

      // findFirst, nao findUnique: o Prisma nao aceita `null` no `where` de
      // uma chave composta mesmo com NULLS NOT DISTINCT na constraint (ver
      // o comentario em balanceLock.ts). Aqui e so leitura, sem lock, entao
      // um filtro simples resolve.
      const balance = await tenantDb().stockBalance.findFirst({
        where: { productId: item.productId, warehouseId: count.warehouseId, batchId: null },
      });

      const adjustment = await stockLedgerService.recordMovement(
        {
          idempotencyKey: `count-reconcile:${countId}:${item.productId}`,
          type: divergence.isPositive() ? "AJUSTE_POSITIVO" : "AJUSTE_NEGATIVO",
          productId: item.productId,
          warehouseId: count.warehouseId,
          quantity: divergence.abs().toString(),
          // Custo desconhecido para sobra encontrada na contagem sem historico
          // de saldo — usa o custo medio vigente (0 se o produto nunca moveu).
          unitCost: (balance?.avgCost ?? toDecimal(0)).toString(),
          reference: `inventory-count:${countId}`,
        },
        userId,
      );
      adjustments.push(adjustment);
    }

    const reconciled = await tenantDb().inventoryCount.update({
      where: { id: countId },
      data: { status: "RECONCILED", closedAt: new Date() },
      include: { items: true },
    });

    return { count: reconciled, adjustments };
  }
}

export const inventoryCountService = new InventoryCountService();
