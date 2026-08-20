import { z } from "zod";

/**
 * Paginacao por cursor (nao por offset): estavel sob escrita concorrente e
 * barata em tabelas grandes, ao contrario de OFFSET/LIMIT que degrada e pode
 * pular/repetir linhas quando o ledger de estoque esta sendo escrito.
 */
export const cursorPageQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type CursorPageQuery = z.infer<typeof cursorPageQuerySchema>;

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const moneySchema = z
  .string()
  .regex(/^-?\d+(\.\d{1,4})?$/, "valor monetario invalido")
  .describe("Decimal como string para nao perder precisao em JSON");

export const quantitySchema = z
  .string()
  .regex(/^-?\d+(\.\d{1,4})?$/, "quantidade invalida");
