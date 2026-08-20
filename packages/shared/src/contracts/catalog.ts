import { z } from "zod";
import { TRACKING_MODES } from "../enums.js";
import { moneySchema } from "./common.js";

export const unitOfMeasureSchema = z.object({
  code: z.string().min(1).max(10),
  name: z.string().min(1).max(60),
});
export type UnitOfMeasureInput = z.infer<typeof unitOfMeasureSchema>;

export const categorySchema = z.object({
  name: z.string().min(1).max(120),
  parentId: z.string().uuid().nullable().optional(),
});
export type CategoryInput = z.infer<typeof categorySchema>;

/**
 * Campos fiscais brasileiros ficam presentes e opcionais desde o MVP.
 * O sistema nao emite NF-e ainda, mas o modelo de dados nao exige migracao
 * quando essa fase entrar.
 */
export const fiscalFieldsSchema = z.object({
  ncm: z.string().length(8).optional(),
  cest: z.string().length(7).optional(),
  origem: z.string().max(2).optional(),
  cstIcms: z.string().max(3).optional(),
  cfopPadrao: z.string().max(4).optional(),
  unidadeTributavel: z.string().max(10).optional(),
});

export const productSchema = z.object({
  sku: z.string().min(1).max(60),
  name: z.string().min(1).max(200),
  categoryId: z.string().uuid().nullable().optional(),
  unitOfMeasureId: z.string().uuid(),
  trackingMode: z.enum(TRACKING_MODES).default("NONE"),
  costPrice: moneySchema.optional(),
  salePrice: moneySchema.optional(),
  minStock: z.string().optional(),
  maxStock: z.string().optional(),
  reorderPoint: z.string().optional(),
  leadTimeDays: z.number().int().min(0).optional(),
  barcodes: z.array(z.string().min(6).max(30)).default([]),
  active: z.boolean().default(true),
  fiscal: fiscalFieldsSchema.optional(),
});
export type ProductInput = z.infer<typeof productSchema>;

export const supplierSchema = z.object({
  legalName: z.string().min(1).max(200),
  tradeName: z.string().max(200).optional(),
  document: z.string().min(11).max(18), // CNPJ ou CPF
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
});
export type SupplierInput = z.infer<typeof supplierSchema>;

export const warehouseSchema = z.object({
  companyUnitId: z.string().uuid(),
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(20),
});
export type WarehouseInput = z.infer<typeof warehouseSchema>;
