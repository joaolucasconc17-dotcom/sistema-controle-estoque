import { z } from "zod";
import { moneySchema, quantitySchema } from "./common.js";

export const purchaseOrderItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: quantitySchema,
  unitCost: moneySchema,
});

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  expectedDate: z.string().datetime().optional(),
  items: z.array(purchaseOrderItemSchema).min(1),
  notes: z.string().max(500).optional(),
});
export type CreatePurchaseOrderInput = z.infer<
  typeof createPurchaseOrderSchema
>;

export const receiptItemSchema = z.object({
  purchaseOrderItemId: z.string().uuid(),
  receivedQuantity: quantitySchema,
  batchCode: z.string().max(60).optional(),
  expirationDate: z.string().datetime().optional(),
});

export const createGoodsReceiptSchema = z.object({
  idempotencyKey: z.string().uuid(),
  purchaseOrderId: z.string().uuid(),
  items: z.array(receiptItemSchema).min(1),
});
export type CreateGoodsReceiptInput = z.infer<typeof createGoodsReceiptSchema>;
