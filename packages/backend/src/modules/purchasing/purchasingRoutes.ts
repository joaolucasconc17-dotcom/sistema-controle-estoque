import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createGoodsReceiptSchema, createPurchaseOrderSchema, cursorPageQuerySchema } from "@estoque/shared";
import { authenticate } from "../../platform/http/authenticate.js";
import { requirePermission } from "../../platform/http/authorize.js";
import { paginateByCursor } from "../../platform/http/pagination.js";
import { tenantDb } from "../../platform/tenant/tenantContext.js";
import { AppError } from "../../platform/errors.js";
import { purchaseOrderService } from "./PurchaseOrderService.js";
import { goodsReceiptService } from "./GoodsReceiptService.js";

const idParamSchema = z.object({ id: z.string().uuid() });
const listOrdersQuerySchema = cursorPageQuerySchema.extend({
  status: z.string().optional(),
  supplierId: z.string().uuid().optional(),
});

export async function purchasingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/orders", { preHandler: requirePermission("purchasing.order.create") }, async (request) => {
    const { status, supplierId, ...query } = listOrdersQuerySchema.parse(request.query);
    return paginateByCursor(query, (args) =>
      tenantDb().purchaseOrder.findMany({
        ...args,
        where: { status: status as never, supplierId },
        include: { supplier: { select: { legalName: true } }, warehouse: { select: { name: true } } },
        orderBy: { id: "desc" },
      }),
    );
  });

  app.get("/orders/:id", { preHandler: requirePermission("purchasing.order.create") }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const order = await tenantDb().purchaseOrder.findUnique({
      where: { id },
      include: { items: { include: { product: { select: { sku: true, name: true } } } }, supplier: true, receipts: { include: { items: true } } },
    });
    if (!order) throw AppError.notFound("Pedido de compra nao encontrado");
    return order;
  });

  app.post("/orders", { preHandler: requirePermission("purchasing.order.create") }, async (request, reply) => {
    const body = createPurchaseOrderSchema.parse(request.body);
    const order = await purchaseOrderService.create(body);
    reply.status(201).send(order);
  });

  app.post("/orders/:id/submit", { preHandler: requirePermission("purchasing.order.create") }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return purchaseOrderService.transition(id, "PENDING_APPROVAL", request.auth!.userId);
  });

  app.post("/orders/:id/approve", { preHandler: requirePermission("purchasing.order.approve") }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return purchaseOrderService.transition(id, "APPROVED", request.auth!.userId);
  });

  app.post("/orders/:id/cancel", { preHandler: requirePermission("purchasing.order.approve") }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return purchaseOrderService.transition(id, "CANCELLED", request.auth!.userId);
  });

  app.get("/receipts/:id", { preHandler: requirePermission("purchasing.receipt.create") }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const receipt = await tenantDb().goodsReceipt.findUnique({ where: { id }, include: { items: true } });
    if (!receipt) throw AppError.notFound("Recebimento nao encontrado");
    return receipt;
  });

  app.post("/receipts", { preHandler: requirePermission("purchasing.receipt.create") }, async (request, reply) => {
    const body = createGoodsReceiptSchema.parse(request.body);
    const receipt = await goodsReceiptService.create(body, request.auth!.userId);
    reply.status(201).send(receipt);
  });
}
