import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { cursorPageQuerySchema, idParamSchema, supplierSchema } from "@estoque/shared";
import { authenticate } from "../../platform/http/authenticate.js";
import { requirePermission } from "../../platform/http/authorize.js";
import { paginateByCursor } from "../../platform/http/pagination.js";
import { tenantDb } from "../../platform/tenant/tenantContext.js";
import { AppError } from "../../platform/errors.js";
import { writeAudit } from "../audit/auditLog.js";

const listSuppliersQuerySchema = cursorPageQuerySchema.extend({
  search: z.string().min(1).max(120).optional(),
});

const linkProductSchema = z.object({
  productId: z.string().uuid(),
  supplierSku: z.string().max(60).optional(),
  lastPurchaseCost: z.string().optional(),
});

export async function supplierRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/suppliers", { preHandler: requirePermission("catalog.supplier.read") }, async (request) => {
    const { search, ...query } = listSuppliersQuerySchema.parse(request.query);
    return paginateByCursor(query, (args) =>
      tenantDb().supplier.findMany({
        ...args,
        where: search
          ? {
              OR: [
                { legalName: { contains: search, mode: "insensitive" } },
                { tradeName: { contains: search, mode: "insensitive" } },
                { document: { contains: search } },
              ],
            }
          : undefined,
        orderBy: [{ legalName: "asc" }, { id: "asc" }],
      }),
    );
  });

  app.get("/suppliers/:id", { preHandler: requirePermission("catalog.supplier.read") }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const supplier = await tenantDb().supplier.findUnique({
      where: { id },
      include: { products: { include: { product: true } } },
    });
    if (!supplier) throw AppError.notFound("Fornecedor nao encontrado");
    return supplier;
  });

  app.post("/suppliers", { preHandler: requirePermission("catalog.supplier.write") }, async (request, reply) => {
    const body = supplierSchema.parse(request.body);
    const existing = await tenantDb().supplier.findUnique({ where: { document: body.document } });
    if (existing) throw AppError.conflict(`Ja existe um fornecedor com o documento "${body.document}"`);

    const supplier = await tenantDb().supplier.create({ data: body });
    await writeAudit({ action: "supplier.created", entityType: "Supplier", entityId: supplier.id, after: supplier });
    reply.status(201).send(supplier);
  });

  app.patch("/suppliers/:id", { preHandler: requirePermission("catalog.supplier.write") }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const body = supplierSchema.partial().parse(request.body);

    const before = await tenantDb().supplier.findUnique({ where: { id } });
    if (!before) throw AppError.notFound("Fornecedor nao encontrado");

    const after = await tenantDb().supplier.update({ where: { id }, data: body });
    await writeAudit({ action: "supplier.updated", entityType: "Supplier", entityId: id, before, after });
    return after;
  });

  // Vincula um produto a este fornecedor (base para historico de preco de
  // compra, usado pelo modulo de Compras na Fase 3).
  app.put(
    "/suppliers/:id/products",
    { preHandler: requirePermission("catalog.supplier.write") },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const body = linkProductSchema.parse(request.body);

      const [supplier, product] = await Promise.all([
        tenantDb().supplier.findUnique({ where: { id } }),
        tenantDb().product.findUnique({ where: { id: body.productId } }),
      ]);
      if (!supplier) throw AppError.notFound("Fornecedor nao encontrado");
      if (!product) throw AppError.validation("Produto informado nao existe");

      const link = await tenantDb().productSupplier.upsert({
        where: { productId_supplierId: { productId: body.productId, supplierId: id } },
        create: {
          productId: body.productId,
          supplierId: id,
          supplierSku: body.supplierSku,
          lastPurchaseCost: body.lastPurchaseCost,
        },
        update: { supplierSku: body.supplierSku, lastPurchaseCost: body.lastPurchaseCost },
      });
      reply.status(200).send(link);
    },
  );

  app.delete(
    "/suppliers/:id/products/:productId",
    { preHandler: requirePermission("catalog.supplier.write") },
    async (request, reply) => {
      const { id, productId } = z.object({ id: z.string().uuid(), productId: z.string().uuid() }).parse(
        request.params,
      );
      await tenantDb()
        .productSupplier.delete({ where: { productId_supplierId: { productId, supplierId: id } } })
        .catch(() => {
          throw AppError.notFound("Vinculo nao encontrado");
        });
      reply.status(204).send();
    },
  );
}
