import type { FastifyInstance } from "fastify";
import { categorySchema, idParamSchema } from "@estoque/shared";
import { authenticate } from "../../platform/http/authenticate.js";
import { requirePermission } from "../../platform/http/authorize.js";
import { tenantDb } from "../../platform/tenant/tenantContext.js";
import { AppError } from "../../platform/errors.js";

export async function categoryRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/categories", async () => {
    return tenantDb().category.findMany({ orderBy: { name: "asc" } });
  });

  app.post("/categories", { preHandler: requirePermission("catalog.reference.write") }, async (request, reply) => {
    const body = categorySchema.parse(request.body);
    if (body.parentId) {
      const parent = await tenantDb().category.findUnique({ where: { id: body.parentId } });
      if (!parent) throw AppError.validation("Categoria pai informada nao existe");
    }
    const category = await tenantDb().category.create({ data: body });
    reply.status(201).send(category);
  });

  app.patch(
    "/categories/:id",
    { preHandler: requirePermission("catalog.reference.write") },
    async (request) => {
      const { id } = idParamSchema.parse(request.params);
      const body = categorySchema.partial().parse(request.body);
      if (body.parentId === id) throw AppError.validation("Categoria nao pode ser pai dela mesma");

      const existing = await tenantDb().category.findUnique({ where: { id } });
      if (!existing) throw AppError.notFound("Categoria nao encontrada");

      return tenantDb().category.update({ where: { id }, data: body });
    },
  );
}
