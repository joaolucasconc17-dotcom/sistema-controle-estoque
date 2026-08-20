import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { storageLocationSchema } from "@estoque/shared";
import { authenticate } from "../../platform/http/authenticate.js";
import { requirePermission } from "../../platform/http/authorize.js";
import { tenantDb } from "../../platform/tenant/tenantContext.js";
import { AppError } from "../../platform/errors.js";

const warehouseIdParamSchema = z.object({ warehouseId: z.string().uuid() });
const locationIdParamSchema = z.object({ id: z.string().uuid() });

export async function storageLocationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/warehouses/:warehouseId/locations", async (request) => {
    const { warehouseId } = warehouseIdParamSchema.parse(request.params);
    return tenantDb().storageLocation.findMany({ where: { warehouseId }, orderBy: { code: "asc" } });
  });

  app.post(
    "/warehouses/:warehouseId/locations",
    { preHandler: requirePermission("org.manage") },
    async (request, reply) => {
      const { warehouseId } = warehouseIdParamSchema.parse(request.params);
      const body = storageLocationSchema.parse(request.body);

      const warehouse = await tenantDb().warehouse.findUnique({ where: { id: warehouseId } });
      if (!warehouse) throw AppError.notFound("Deposito nao encontrado");

      const existing = await tenantDb().storageLocation.findUnique({
        where: { warehouseId_code: { warehouseId, code: body.code } },
      });
      if (existing) throw AppError.conflict(`Ja existe o endereco "${body.code}" neste deposito`);

      const location = await tenantDb().storageLocation.create({ data: { warehouseId, code: body.code } });
      reply.status(201).send(location);
    },
  );

  app.delete("/locations/:id", { preHandler: requirePermission("org.manage") }, async (request, reply) => {
    const { id } = locationIdParamSchema.parse(request.params);
    const location = await tenantDb().storageLocation.findUnique({ where: { id } });
    if (!location) throw AppError.notFound("Endereco nao encontrado");
    await tenantDb().storageLocation.delete({ where: { id } });
    reply.status(204).send();
  });
}
