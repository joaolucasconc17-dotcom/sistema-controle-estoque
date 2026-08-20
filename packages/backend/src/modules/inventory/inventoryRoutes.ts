import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createStockMovementSchema,
  cursorPageQuerySchema,
  reverseMovementSchema,
  transferStockSchema,
} from "@estoque/shared";
import { authenticate } from "../../platform/http/authenticate.js";
import { requirePermission } from "../../platform/http/authorize.js";
import { paginateByCursor } from "../../platform/http/pagination.js";
import { tenantDb } from "../../platform/tenant/tenantContext.js";
import { stockLedgerService } from "./StockLedgerService.js";

const listBalancesQuerySchema = cursorPageQuerySchema.extend({
  productId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
});

const kardexQuerySchema = cursorPageQuerySchema.extend({
  warehouseId: z.string().uuid().optional(),
});

export async function inventoryRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.post(
    "/movements",
    { preHandler: requirePermission("inventory.movement.create") },
    async (request, reply) => {
      const body = createStockMovementSchema.parse(request.body);
      const movement = await stockLedgerService.recordMovement(body, request.auth!.userId);
      reply.status(201).send(movement);
    },
  );

  app.post(
    "/transfers",
    { preHandler: requirePermission("inventory.movement.create") },
    async (request, reply) => {
      const body = transferStockSchema.parse(request.body);
      const result = await stockLedgerService.transferStock(body, request.auth!.userId);
      reply.status(201).send(result);
    },
  );

  app.post(
    "/movements/:id/reverse",
    { preHandler: requirePermission("inventory.movement.reverse") },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = reverseMovementSchema.omit({ movementId: true }).parse(request.body);
      const reversal = await stockLedgerService.reverseMovement({ ...body, movementId: id }, request.auth!.userId);
      reply.status(201).send(reversal);
    },
  );

  app.get("/balances", { preHandler: requirePermission("inventory.balance.read") }, async (request) => {
    const { productId, warehouseId, ...query } = listBalancesQuerySchema.parse(request.query);
    return paginateByCursor(query, (args) =>
      tenantDb().stockBalance.findMany({
        ...args,
        where: { productId, warehouseId },
        include: { product: { select: { sku: true, name: true } }, warehouse: { select: { name: true, code: true } } },
        orderBy: { id: "asc" },
      }),
    );
  });

  // Kardex: historico de movimentos de um produto, o ledger cru — cada
  // linha ja traz balanceAfter/avgCostAfter, entao a UI nao precisa
  // recalcular nada, so listar.
  app.get(
    "/kardex/:productId",
    { preHandler: requirePermission("inventory.balance.read") },
    async (request) => {
      const { productId } = z.object({ productId: z.string().uuid() }).parse(request.params);
      const { warehouseId, ...query } = kardexQuerySchema.parse(request.query);
      return paginateByCursor(query, (args) =>
        tenantDb().stockMovement.findMany({
          ...args,
          where: { productId, warehouseId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        }),
      );
    },
  );
}
