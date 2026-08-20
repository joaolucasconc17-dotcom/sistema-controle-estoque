import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { startInventoryCountSchema, submitCountItemSchema } from "@estoque/shared";
import { authenticate } from "../../platform/http/authenticate.js";
import { requirePermission } from "../../platform/http/authorize.js";
import { tenantDb } from "../../platform/tenant/tenantContext.js";
import { AppError } from "../../platform/errors.js";
import { inventoryCountService } from "./InventoryCountService.js";

const idParamSchema = z.object({ id: z.string().uuid() });

export async function inventoryCountRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/counts/:id", { preHandler: requirePermission("inventory.count.execute") }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const count = await tenantDb().inventoryCount.findUnique({
      where: { id },
      include: { items: { include: { product: { select: { sku: true, name: true } } } } },
    });
    if (!count) throw AppError.notFound("Contagem nao encontrada");
    return count;
  });

  app.post("/counts", { preHandler: requirePermission("inventory.count.execute") }, async (request, reply) => {
    const body = startInventoryCountSchema.parse(request.body);
    const count = await inventoryCountService.start(body);
    reply.status(201).send(count);
  });

  app.post("/counts/:id/items", { preHandler: requirePermission("inventory.count.execute") }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const body = submitCountItemSchema.parse(request.body);
    return inventoryCountService.submitItem(id, body);
  });

  app.post(
    "/counts/:id/reconcile",
    { preHandler: requirePermission("inventory.count.approve") },
    async (request) => {
      const { id } = idParamSchema.parse(request.params);
      return inventoryCountService.reconcile(id, request.auth!.userId);
    },
  );
}
