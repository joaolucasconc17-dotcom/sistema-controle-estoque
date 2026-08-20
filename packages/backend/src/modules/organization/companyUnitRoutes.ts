import type { FastifyInstance } from "fastify";
import { companyUnitSchema, cursorPageQuerySchema, idParamSchema } from "@estoque/shared";
import { authenticate } from "../../platform/http/authenticate.js";
import { requirePermission } from "../../platform/http/authorize.js";
import { paginateByCursor } from "../../platform/http/pagination.js";
import { tenantDb } from "../../platform/tenant/tenantContext.js";
import { AppError } from "../../platform/errors.js";
import { writeAudit } from "../audit/auditLog.js";

export async function companyUnitRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/company-units", async (request) => {
    const query = cursorPageQuerySchema.parse(request.query);
    return paginateByCursor(query, (args) =>
      tenantDb().companyUnit.findMany({ ...args, orderBy: [{ name: "asc" }, { id: "asc" }] }),
    );
  });

  app.get("/company-units/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const unit = await tenantDb().companyUnit.findUnique({ where: { id } });
    if (!unit) throw AppError.notFound("Filial nao encontrada");
    return unit;
  });

  app.post("/company-units", { preHandler: requirePermission("org.manage") }, async (request, reply) => {
    const body = companyUnitSchema.parse(request.body);
    const existing = await tenantDb().companyUnit.findUnique({ where: { code: body.code } });
    if (existing) throw AppError.conflict(`Ja existe uma filial com o codigo "${body.code}"`);

    const unit = await tenantDb().companyUnit.create({ data: body });
    await writeAudit({ action: "company_unit.created", entityType: "CompanyUnit", entityId: unit.id, after: unit });
    reply.status(201).send(unit);
  });

  app.patch("/company-units/:id", { preHandler: requirePermission("org.manage") }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const body = companyUnitSchema.partial().parse(request.body);

    const before = await tenantDb().companyUnit.findUnique({ where: { id } });
    if (!before) throw AppError.notFound("Filial nao encontrada");

    const after = await tenantDb().companyUnit.update({ where: { id }, data: body });
    await writeAudit({ action: "company_unit.updated", entityType: "CompanyUnit", entityId: id, before, after });
    return after;
  });
}
