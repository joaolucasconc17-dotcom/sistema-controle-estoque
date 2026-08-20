import type { FastifyInstance } from "fastify";
import { unitOfMeasureSchema } from "@estoque/shared";
import { authenticate } from "../../platform/http/authenticate.js";
import { requirePermission } from "../../platform/http/authorize.js";
import { tenantDb } from "../../platform/tenant/tenantContext.js";
import { AppError } from "../../platform/errors.js";

export async function unitOfMeasureRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/units-of-measure", async () => {
    return tenantDb().unitOfMeasure.findMany({ orderBy: { code: "asc" } });
  });

  app.post(
    "/units-of-measure",
    { preHandler: requirePermission("catalog.reference.write") },
    async (request, reply) => {
      const body = unitOfMeasureSchema.parse(request.body);
      const existing = await tenantDb().unitOfMeasure.findUnique({ where: { code: body.code } });
      if (existing) throw AppError.conflict(`Ja existe a unidade "${body.code}"`);
      const uom = await tenantDb().unitOfMeasure.create({ data: body });
      reply.status(201).send(uom);
    },
  );
}
