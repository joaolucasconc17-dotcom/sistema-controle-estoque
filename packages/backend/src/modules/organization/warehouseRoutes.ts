import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { cursorPageQuerySchema, idParamSchema, warehouseSchema } from "@estoque/shared";
import { authenticate } from "../../platform/http/authenticate.js";
import { requirePermission } from "../../platform/http/authorize.js";
import { paginateByCursor } from "../../platform/http/pagination.js";
import { tenantDb } from "../../platform/tenant/tenantContext.js";
import { AppError } from "../../platform/errors.js";
import { writeAudit } from "../audit/auditLog.js";

const listWarehousesQuerySchema = cursorPageQuerySchema.extend({
  companyUnitId: z.string().uuid().optional(),
});

export async function warehouseRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/warehouses", async (request) => {
    const { companyUnitId, ...query } = listWarehousesQuerySchema.parse(request.query);
    return paginateByCursor(query, (args) =>
      tenantDb().warehouse.findMany({
        ...args,
        where: companyUnitId ? { companyUnitId } : undefined,
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
    );
  });

  app.get("/warehouses/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const warehouse = await tenantDb().warehouse.findUnique({ where: { id } });
    if (!warehouse) throw AppError.notFound("Deposito nao encontrado");
    return warehouse;
  });

  app.post("/warehouses", { preHandler: requirePermission("org.manage") }, async (request, reply) => {
    const body = warehouseSchema.parse(request.body);

    const companyUnit = await tenantDb().companyUnit.findUnique({ where: { id: body.companyUnitId } });
    if (!companyUnit) throw AppError.validation("Filial informada nao existe");

    const existing = await tenantDb().warehouse.findUnique({
      where: { companyUnitId_code: { companyUnitId: body.companyUnitId, code: body.code } },
    });
    if (existing) throw AppError.conflict(`Ja existe um deposito com o codigo "${body.code}" nesta filial`);

    const warehouse = await tenantDb().warehouse.create({ data: body });
    await writeAudit({ action: "warehouse.created", entityType: "Warehouse", entityId: warehouse.id, after: warehouse });
    reply.status(201).send(warehouse);
  });

  app.patch("/warehouses/:id", { preHandler: requirePermission("org.manage") }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const body = warehouseSchema.partial().parse(request.body);

    const before = await tenantDb().warehouse.findUnique({ where: { id } });
    if (!before) throw AppError.notFound("Deposito nao encontrado");

    const after = await tenantDb().warehouse.update({ where: { id }, data: body });
    await writeAudit({ action: "warehouse.updated", entityType: "Warehouse", entityId: id, before, after });
    return after;
  });
}
