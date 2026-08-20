import type { CreateGoodsReceiptInput } from "@estoque/shared";
import { tenantDb } from "../../platform/tenant/tenantContext.js";
import { AppError } from "../../platform/errors.js";
import { toDecimal } from "../inventory/stockMath.js";
import { stockLedgerService } from "../inventory/StockLedgerService.js";

const RECEIVABLE_STATUSES = new Set(["APPROVED", "PARTIALLY_RECEIVED"]);

export class GoodsReceiptService {
  /**
   * Recebe (total ou parcialmente) um pedido de compra: para cada item,
   * gera uma ENTRADA de verdade no estoque via StockLedgerService — o
   * recebimento nunca escreve em stock_balance diretamente, so atraves do
   * motor de estoque ja testado.
   */
  async create(input: CreateGoodsReceiptInput, userId: string) {
    const existing = await tenantDb().goodsReceipt.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { items: true },
    });
    if (existing) return existing;

    const order = await tenantDb().purchaseOrder.findUnique({
      where: { id: input.purchaseOrderId },
      include: { items: true },
    });
    if (!order) throw AppError.notFound("Pedido de compra nao encontrado");
    if (!RECEIVABLE_STATUSES.has(order.status)) {
      throw AppError.conflict(`Pedido no status ${order.status} nao pode receber mercadoria`);
    }

    const itemsById = new Map(order.items.map((i) => [i.id, i]));
    for (const receiptItem of input.items) {
      const orderItem = itemsById.get(receiptItem.purchaseOrderItemId);
      if (!orderItem) throw AppError.validation("Item de pedido invalido para esta compra");
      if (orderItem.purchaseOrderId !== order.id) throw AppError.validation("Item nao pertence a este pedido");

      const remaining = orderItem.quantity.minus(orderItem.receivedQuantity);
      if (toDecimal(receiptItem.receivedQuantity).greaterThan(remaining)) {
        throw AppError.validation(
          `Recebendo mais do que o pendente para o item ${orderItem.id}: pendente ${remaining.toString()}`,
        );
      }
    }

    const movements: { purchaseOrderItemId: string; movementId: string; receiptItem: (typeof input.items)[number] }[] = [];

    for (const receiptItem of input.items) {
      const orderItem = itemsById.get(receiptItem.purchaseOrderItemId)!;
      const product = await tenantDb().product.findUniqueOrThrow({ where: { id: orderItem.productId } });

      let batchId: string | null = null;
      if (product.trackingMode !== "NONE") {
        if (!receiptItem.batchCode) {
          throw AppError.validation(`Produto ${product.sku} exige lote — informe batchCode`);
        }
        const batch = await tenantDb().batch.upsert({
          where: { productId_code: { productId: product.id, code: receiptItem.batchCode } },
          create: {
            productId: product.id,
            code: receiptItem.batchCode,
            expirationDate: receiptItem.expirationDate ? new Date(receiptItem.expirationDate) : null,
          },
          update: {},
        });
        batchId = batch.id;
      }

      const movement = await stockLedgerService.recordMovement(
        {
          idempotencyKey: `receipt:${input.idempotencyKey}:${orderItem.id}`,
          type: "ENTRADA",
          productId: orderItem.productId,
          warehouseId: order.warehouseId,
          quantity: receiptItem.receivedQuantity,
          unitCost: orderItem.unitCost.toString(),
          batchId,
          reference: `purchase-order:${order.id}`,
        },
        userId,
      );

      movements.push({ purchaseOrderItemId: orderItem.id, movementId: movement.id, receiptItem });
    }

    const receipt = await tenantDb().$transaction(async (tx) => {
      for (const { purchaseOrderItemId, receiptItem } of movements) {
        await tx.purchaseOrderItem.update({
          where: { id: purchaseOrderItemId },
          data: { receivedQuantity: { increment: toDecimal(receiptItem.receivedQuantity) } },
        });
      }

      const refreshedItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: order.id } });
      const fullyReceived = refreshedItems.every((i) => i.receivedQuantity.greaterThanOrEqualTo(i.quantity));
      await tx.purchaseOrder.update({
        where: { id: order.id },
        data: { status: fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED" },
      });

      // Historico de preco por fornecedor — usado pela Fase 4 (relatorios)
      // e por futura sugestao de compra.
      for (const { purchaseOrderItemId } of movements) {
        const orderItem = itemsById.get(purchaseOrderItemId)!;
        await tx.productSupplier.upsert({
          where: { productId_supplierId: { productId: orderItem.productId, supplierId: order.supplierId } },
          create: { productId: orderItem.productId, supplierId: order.supplierId, lastPurchaseCost: orderItem.unitCost },
          update: { lastPurchaseCost: orderItem.unitCost },
        });
      }

      return tx.goodsReceipt.create({
        data: {
          purchaseOrderId: order.id,
          idempotencyKey: input.idempotencyKey,
          receivedByUserId: userId,
          items: {
            create: movements.map(({ purchaseOrderItemId, movementId, receiptItem }) => ({
              purchaseOrderItemId,
              receivedQuantity: toDecimal(receiptItem.receivedQuantity),
              batchCode: receiptItem.batchCode,
              expirationDate: receiptItem.expirationDate ? new Date(receiptItem.expirationDate) : null,
              stockMovementId: movementId,
            })),
          },
        },
        include: { items: true },
      });
    });

    return receipt;
  }
}

export const goodsReceiptService = new GoodsReceiptService();
