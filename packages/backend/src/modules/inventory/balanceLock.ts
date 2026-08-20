import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/tenant/index.js";

export type TenantTx = Prisma.TransactionClient;

export interface BalanceKey {
  productId: string;
  warehouseId: string;
  batchId: string | null;
}

interface LockedBalanceRow {
  id: string;
  quantity: Prisma.Decimal;
  avgCost: Prisma.Decimal;
  reservedQuantity: Prisma.Decimal;
}

/**
 * Garante que a linha de saldo exista (upsert com zeros) e a TRAVA
 * (`SELECT ... FOR UPDATE`) dentro da transacao atual, devolvendo os
 * valores JA TRAVADOS.
 *
 * `FOR UPDATE` nao tem equivalente direto no query builder do Prisma —
 * precisa de SQL cru. O upsert TAMBEM precisa ser cru: o Prisma nao deixa
 * usar `null` no `where` de uma chave composta (mesmo com nossa constraint
 * `NULLS NOT DISTINCT`), entao `stockBalance.upsert()` tipado nem compila
 * quando `batchId` e nulo. `INSERT ... ON CONFLICT DO NOTHING` resolve os
 * dois problemas de uma vez, e a comparacao no SELECT usa
 * `IS NOT DISTINCT FROM` em vez de `=` pelo mesmo motivo (NULL = NULL e
 * sempre falso em SQL padrao, mas "sem lote" deve valer como igual a si
 * mesmo aqui).
 */
export async function lockBalance(tx: TenantTx, key: BalanceKey): Promise<LockedBalanceRow> {
  await tx.$executeRaw`
    INSERT INTO stock_balance (id, "productId", "warehouseId", "batchId", quantity, "reservedQuantity", "avgCost", "updatedAt")
    VALUES (${randomUUID()}, ${key.productId}, ${key.warehouseId}, ${key.batchId}, 0, 0, 0, now())
    ON CONFLICT ("productId", "warehouseId", "batchId") DO NOTHING
  `;

  const rows = await tx.$queryRaw<LockedBalanceRow[]>`
    SELECT id, quantity, "avgCost", "reservedQuantity"
    FROM stock_balance
    WHERE "productId" = ${key.productId}
      AND "warehouseId" = ${key.warehouseId}
      AND "batchId" IS NOT DISTINCT FROM ${key.batchId}
    FOR UPDATE
  `;

  const row = rows[0];
  if (!row) throw new Error("lockBalance: linha de saldo nao encontrada apos upsert — nao deveria acontecer");
  return row;
}

/**
 * Trava DUAS linhas de saldo (usado em transferencia) em ordem
 * DETERMINISTICA — sempre pelo warehouseId em ordem alfabetica — para que
 * duas transferencias concorrentes em sentidos opostos entre os mesmos dois
 * depositos nunca formem um deadlock (as duas tentariam travar A-depois-B
 * numa e B-depois-A na outra, se a ordem nao fosse fixa).
 */
export async function lockTwoBalances(
  tx: TenantTx,
  keyA: BalanceKey,
  keyB: BalanceKey,
): Promise<{ a: LockedBalanceRow; b: LockedBalanceRow }> {
  const [first, second] = keyA.warehouseId <= keyB.warehouseId ? [keyA, keyB] : [keyB, keyA];
  const firstLocked = await lockBalance(tx, first);
  const secondLocked = await lockBalance(tx, second);

  return first === keyA ? { a: firstLocked, b: secondLocked } : { a: secondLocked, b: firstLocked };
}
