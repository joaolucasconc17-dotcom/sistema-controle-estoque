import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { cursorPageQuerySchema, idParamSchema, productSchema } from "@estoque/shared";
import { authenticate } from "../../platform/http/authenticate.js";
import { requirePermission } from "../../platform/http/authorize.js";
import { paginateByCursor } from "../../platform/http/pagination.js";
import { tenantDb } from "../../platform/tenant/tenantContext.js";
import { AppError } from "../../platform/errors.js";
import { productService } from "./productService.js";

const listProductsQuerySchema = cursorPageQuerySchema.extend({
  search: z.string().min(1).max(120).optional(),
  active: z.coerce.boolean().optional(),
});

export async function productRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/products", { preHandler: requirePermission("catalog.product.read") }, async (request) => {
    const { search, active, ...query } = listProductsQuerySchema.parse(request.query);
    return paginateByCursor(query, (args) =>
      tenantDb().product.findMany({
        ...args,
        where: {
          active,
          ...(search
            ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { sku: { contains: search, mode: "insensitive" } }] }
            : {}),
        },
        include: { barcodes: true, category: true, unitOfMeasure: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
    );
  });

  app.get("/products/:id", { preHandler: requirePermission("catalog.product.read") }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const product = await tenantDb().product.findUnique({
      where: { id },
      include: { barcodes: true, category: true, unitOfMeasure: true },
    });
    if (!product) throw AppError.notFound("Produto nao encontrado");
    return product;
  });

  // Usado pelas telas de leitor de codigo de barras (Fase 5): busca direta
  // por EAN/GTIN, sem precisar paginar a lista inteira.
  app.get("/products/by-barcode/:barcode", { preHandler: requirePermission("catalog.product.read") }, async (request) => {
    const { barcode } = z.object({ barcode: z.string().min(6).max(30) }).parse(request.params);
    const record = await tenantDb().productBarcode.findUnique({
      where: { barcode },
      include: { product: { include: { barcodes: true, category: true, unitOfMeasure: true } } },
    });
    if (!record) throw AppError.notFound("Nenhum produto com este codigo de barras");
    return record.product;
  });

  app.post("/products", { preHandler: requirePermission("catalog.product.write") }, async (request, reply) => {
    const body = productSchema.parse(request.body);
    const product = await productService.create(body);
    reply.status(201).send(product);
  });

  app.patch("/products/:id", { preHandler: requirePermission("catalog.product.write") }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const body = productSchema.partial().parse(request.body);
    return productService.update(id, body);
  });

  app.delete("/products/:id", { preHandler: requirePermission("catalog.product.delete") }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return productService.deactivate(id);
  });

  // Lotes: obrigatorios para movimentar produtos com trackingMode
  // BATCH/SERIAL (ver StockLedgerService.assertProductAndBatch).
  app.get("/products/:id/batches", { preHandler: requirePermission("catalog.product.read") }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return tenantDb().batch.findMany({ where: { productId: id }, orderBy: { expirationDate: "asc" } });
  });

  app.post("/products/:id/batches", { preHandler: requirePermission("catalog.product.write") }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const body = z
      .object({ code: z.string().min(1).max(60), expirationDate: z.string().datetime().optional() })
      .parse(request.body);

    const product = await tenantDb().product.findUnique({ where: { id } });
    if (!product) throw AppError.notFound("Produto nao encontrado");

    const existing = await tenantDb().batch.findUnique({
      where: { productId_code: { productId: id, code: body.code } },
    });
    if (existing) throw AppError.conflict(`Ja existe o lote "${body.code}" para este produto`);

    const batch = await tenantDb().batch.create({
      data: { productId: id, code: body.code, expirationDate: body.expirationDate ? new Date(body.expirationDate) : null },
    });
    reply.status(201).send(batch);
  });
}
