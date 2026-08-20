import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../platform/http/authenticate.js";
import { requirePermission } from "../../platform/http/authorize.js";
import { reportsService } from "./ReportsService.js";

const warehouseFilterSchema = z.object({ warehouseId: z.string().uuid().optional() });
const daysQuerySchema = warehouseFilterSchema.extend({ days: z.coerce.number().int().min(1).max(3650).default(90) });

export async function reportsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);
  app.addHook("preHandler", requirePermission("reports.read"));

  app.get("/dashboard", async (request) => {
    const { warehouseId } = warehouseFilterSchema.parse(request.query);
    return reportsService.dashboard(warehouseId);
  });

  app.get("/valuation", async (request) => {
    const { warehouseId } = warehouseFilterSchema.parse(request.query);
    return reportsService.valuation(warehouseId);
  });

  app.get("/abc-curve", async (request) => {
    const { warehouseId } = warehouseFilterSchema.parse(request.query);
    return reportsService.abcCurve(warehouseId);
  });

  app.get("/low-stock", async (request) => {
    const { warehouseId } = warehouseFilterSchema.parse(request.query);
    return reportsService.lowStock(warehouseId);
  });

  app.get("/stale-products", async (request) => {
    const { warehouseId, days } = daysQuerySchema.parse(request.query);
    return reportsService.staleProducts(days, warehouseId);
  });

  app.get("/expiring-batches", async (request) => {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(3650).default(30) }).parse(request.query);
    return reportsService.expiringBatches(days);
  });

  app.get("/turnover", async (request) => {
    const { warehouseId, days } = daysQuerySchema.extend({ days: z.coerce.number().int().min(1).max(3650).default(30) }).parse(request.query);
    return reportsService.turnover(days, warehouseId);
  });
}
