import type { ProductInput } from "@estoque/shared";
import { tenantDb } from "../../platform/tenant/tenantContext.js";
import { AppError } from "../../platform/errors.js";
import { writeAudit } from "../audit/auditLog.js";

const productInclude = { barcodes: true, category: true, unitOfMeasure: true } as const;

export class ProductService {
  async create(input: ProductInput) {
    await this.assertReferencesExist(input);
    await this.assertBarcodesAvailable(input.barcodes);

    const existingSku = await tenantDb().product.findUnique({ where: { sku: input.sku } });
    if (existingSku) throw AppError.conflict(`Ja existe um produto com o SKU "${input.sku}"`);

    const product = await tenantDb().$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          sku: input.sku,
          name: input.name,
          categoryId: input.categoryId ?? null,
          unitOfMeasureId: input.unitOfMeasureId,
          trackingMode: input.trackingMode,
          costPrice: input.costPrice,
          salePrice: input.salePrice,
          minStock: input.minStock,
          maxStock: input.maxStock,
          reorderPoint: input.reorderPoint,
          leadTimeDays: input.leadTimeDays,
          active: input.active,
          ncm: input.fiscal?.ncm,
          cest: input.fiscal?.cest,
          origem: input.fiscal?.origem,
          cstIcms: input.fiscal?.cstIcms,
          cfopPadrao: input.fiscal?.cfopPadrao,
          unidadeTributavel: input.fiscal?.unidadeTributavel,
          barcodes: { create: input.barcodes.map((barcode) => ({ barcode })) },
        },
        include: productInclude,
      });
      return created;
    });

    await writeAudit({ action: "product.created", entityType: "Product", entityId: product.id, after: product });
    return product;
  }

  async update(id: string, input: Partial<ProductInput>) {
    const before = await tenantDb().product.findUnique({ where: { id }, include: productInclude });
    if (!before) throw AppError.notFound("Produto nao encontrado");

    await this.assertReferencesExist(input);
    if (input.barcodes) {
      const currentBarcodes = new Set(before.barcodes.map((b) => b.barcode));
      const newBarcodes = input.barcodes.filter((b) => !currentBarcodes.has(b));
      await this.assertBarcodesAvailable(newBarcodes);
    }

    const after = await tenantDb().$transaction(async (tx) => {
      if (input.barcodes) {
        await tx.productBarcode.deleteMany({ where: { productId: id } });
        await tx.productBarcode.createMany({
          data: input.barcodes.map((barcode) => ({ productId: id, barcode })),
        });
      }
      return tx.product.update({
        where: { id },
        data: {
          name: input.name,
          categoryId: input.categoryId,
          unitOfMeasureId: input.unitOfMeasureId,
          trackingMode: input.trackingMode,
          costPrice: input.costPrice,
          salePrice: input.salePrice,
          minStock: input.minStock,
          maxStock: input.maxStock,
          reorderPoint: input.reorderPoint,
          leadTimeDays: input.leadTimeDays,
          active: input.active,
          ncm: input.fiscal?.ncm,
          cest: input.fiscal?.cest,
          origem: input.fiscal?.origem,
          cstIcms: input.fiscal?.cstIcms,
          cfopPadrao: input.fiscal?.cfopPadrao,
          unidadeTributavel: input.fiscal?.unidadeTributavel,
        },
        include: productInclude,
      });
    });

    await writeAudit({ action: "product.updated", entityType: "Product", entityId: id, before, after });
    return after;
  }

  /**
   * "Excluir" produto nunca apaga a linha — historico de estoque/compras
   * pode referenciar o produto para sempre. Isso so desativa, o que ja
   * impede novas movimentacoes/pedidos contra ele (checado nos services que
   * os criam).
   */
  async deactivate(id: string) {
    const before = await tenantDb().product.findUnique({ where: { id } });
    if (!before) throw AppError.notFound("Produto nao encontrado");
    if (!before.active) return before;

    const after = await tenantDb().product.update({ where: { id }, data: { active: false } });
    await writeAudit({ action: "product.deactivated", entityType: "Product", entityId: id, before, after });
    return after;
  }

  private async assertReferencesExist(input: Partial<ProductInput>) {
    if (input.unitOfMeasureId) {
      const uom = await tenantDb().unitOfMeasure.findUnique({ where: { id: input.unitOfMeasureId } });
      if (!uom) throw AppError.validation("Unidade de medida informada nao existe");
    }
    if (input.categoryId) {
      const category = await tenantDb().category.findUnique({ where: { id: input.categoryId } });
      if (!category) throw AppError.validation("Categoria informada nao existe");
    }
  }

  private async assertBarcodesAvailable(barcodes: string[] | undefined) {
    if (!barcodes || barcodes.length === 0) return;
    const taken = await tenantDb().productBarcode.findMany({ where: { barcode: { in: barcodes } } });
    if (taken.length > 0) {
      throw AppError.conflict(
        `Codigo(s) de barra ja em uso: ${taken.map((b) => b.barcode).join(", ")}`,
      );
    }
  }
}

export const productService = new ProductService();
