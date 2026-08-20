import type { CreatePurchaseOrderInput } from "@estoque/shared";
import { tenantDb } from "../../platform/tenant/tenantContext.js";
import { AppError } from "../../platform/errors.js";
import { toDecimal } from "../inventory/stockMath.js";
import { writeAudit } from "../audit/auditLog.js";

const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["PENDING_APPROVAL", "CANCELLED"],
  PENDING_APPROVAL: ["APPROVED", "CANCELLED", "DRAFT"],
  APPROVED: ["PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"],
  PARTIALLY_RECEIVED: ["RECEIVED", "CANCELLED"],
  RECEIVED: [],
  CANCELLED: [],
};

export class PurchaseOrderService {
  async create(input: CreatePurchaseOrderInput) {
    const [supplier, warehouse] = await Promise.all([
      tenantDb().supplier.findUnique({ where: { id: input.supplierId } }),
      tenantDb().warehouse.findUnique({ where: { id: input.warehouseId } }),
    ]);
    if (!supplier) throw AppError.validation("Fornecedor invalido");
    if (!warehouse) throw AppError.validation("Deposito invalido");

    const productIds = input.items.map((i) => i.productId);
    const products = await tenantDb().product.findMany({ where: { id: { in: productIds } } });
    if (products.length !== new Set(productIds).size) {
      throw AppError.validation("Um ou mais produtos informados nao existem");
    }

    const order = await tenantDb().purchaseOrder.create({
      data: {
        supplierId: input.supplierId,
        warehouseId: input.warehouseId,
        expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
        notes: input.notes,
        items: {
          create: input.items.map((item) => ({
            productId: item.productId,
            quantity: toDecimal(item.quantity),
            unitCost: toDecimal(item.unitCost),
          })),
        },
      },
      include: { items: true },
    });

    await writeAudit({ action: "purchase_order.created", entityType: "PurchaseOrder", entityId: order.id, after: order });
    return order;
  }

  async transition(id: string, toStatus: string, userId: string) {
    const order = await tenantDb().purchaseOrder.findUnique({ where: { id } });
    if (!order) throw AppError.notFound("Pedido de compra nao encontrado");

    const allowed = TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(toStatus)) {
      throw AppError.conflict(`Nao e possivel ir de ${order.status} para ${toStatus}`);
    }

    const updated = await tenantDb().purchaseOrder.update({
      where: { id },
      data: { status: toStatus as never },
    });
    await writeAudit({
      action: `purchase_order.${toStatus.toLowerCase()}`,
      entityType: "PurchaseOrder",
      entityId: id,
      before: { status: order.status },
      after: { status: toStatus },
    });
    void userId;
    return updated;
  }
}

export const purchaseOrderService = new PurchaseOrderService();
