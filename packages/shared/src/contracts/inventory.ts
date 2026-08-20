import { z } from "zod";
import { STOCK_MOVEMENT_TYPES } from "../enums.js";
import { quantitySchema } from "./common.js";

/**
 * Contrato de criacao de movimento de estoque.
 *
 * `idempotencyKey` e obrigatorio: e o que impede que um retry de rede ou um
 * duplo clique do operador gere baixa duplicada. O cliente (web ou PWA) deve
 * gerar um UUID por tentativa logica de operacao e reenviar o MESMO valor
 * em retries daquela operacao.
 */
export const createStockMovementSchema = z.object({
  idempotencyKey: z.string().uuid(),
  type: z.enum(STOCK_MOVEMENT_TYPES),
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  quantity: quantitySchema,
  batchId: z.string().uuid().nullable().optional(),
  unitCost: z.string().optional(),
  reference: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
});
export type CreateStockMovementInput = z.infer<
  typeof createStockMovementSchema
>;

export const transferStockSchema = z.object({
  idempotencyKey: z.string().uuid(),
  productId: z.string().uuid(),
  sourceWarehouseId: z.string().uuid(),
  targetWarehouseId: z.string().uuid(),
  quantity: quantitySchema,
  batchId: z.string().uuid().nullable().optional(),
  notes: z.string().max(500).optional(),
});
export type TransferStockInput = z.infer<typeof transferStockSchema>;

export const reverseMovementSchema = z.object({
  idempotencyKey: z.string().uuid(),
  movementId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});
export type ReverseMovementInput = z.infer<typeof reverseMovementSchema>;

export interface StockBalanceView {
  productId: string;
  warehouseId: string;
  batchId: string | null;
  quantity: string;
  avgCost: string;
  reservedQuantity: string;
  availableQuantity: string;
}

export const createReservationSchema = z.object({
  idempotencyKey: z.string().uuid(),
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  quantity: quantitySchema,
  reference: z.string().max(120).optional(),
});
export type CreateReservationInput = z.infer<typeof createReservationSchema>;

export const startInventoryCountSchema = z.object({
  warehouseId: z.string().uuid(),
  name: z.string().min(1).max(120),
  productIds: z.array(z.string().uuid()).optional(),
});
export type StartInventoryCountInput = z.infer<
  typeof startInventoryCountSchema
>;

export const submitCountItemSchema = z.object({
  productId: z.string().uuid(),
  batchId: z.string().uuid().nullable().optional(),
  countedQuantity: quantitySchema,
});
export type SubmitCountItemInput = z.infer<typeof submitCountItemSchema>;
