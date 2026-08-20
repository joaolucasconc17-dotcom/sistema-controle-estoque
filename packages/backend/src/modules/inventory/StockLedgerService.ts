import type { CreateStockMovementInput, ReverseMovementInput, TransferStockInput } from "@estoque/shared";
import { Prisma } from "../../generated/tenant/index.js";
import { tenantDb } from "../../platform/tenant/tenantContext.js";
import { AppError } from "../../platform/errors.js";
import { applyDecrease, applyIncrease, toDecimal } from "./stockMath.js";
import { lockBalance, lockTwoBalances, type TenantTx } from "./balanceLock.js";

const INCREASE_TYPES = new Set(["ENTRADA", "AJUSTE_POSITIVO"]);

/**
 * Motor de estoque: todo INSERT em stock_movement passa por aqui. A tabela
 * e append-only — nenhum metodo desta classe faz UPDATE/DELETE nela.
 */
export class StockLedgerService {
  async recordMovement(input: CreateStockMovementInput, userId: string) {
    if (input.type === "TRANSFERENCIA_SAIDA" || input.type === "TRANSFERENCIA_ENTRADA") {
      throw AppError.validation("Use POST /inventory/transfers para movimentar entre depositos");
    }
    if (input.type === "ESTORNO") {
      throw AppError.validation("Use POST /inventory/movements/:id/reverse para estornar");
    }

    const existing = await this.findByIdempotencyKey(input.idempotencyKey);
    if (existing) return existing;

    const quantity = toDecimal(input.quantity);
    if (!quantity.isPositive()) throw AppError.validation("Quantidade precisa ser maior que zero");

    const isIncrease = INCREASE_TYPES.has(input.type);
    if (isIncrease && (input.unitCost === undefined || input.unitCost === null)) {
      throw AppError.validation("unitCost e obrigatorio para ENTRADA e AJUSTE_POSITIVO");
    }

    const product = await this.assertProductAndBatch(input.productId, input.batchId ?? null);
    await this.assertWarehouseExists(input.warehouseId);
    void product;

    try {
      return await tenantDb().$transaction(async (tx) => {
        const locked = await lockBalance(tx, {
          productId: input.productId,
          warehouseId: input.warehouseId,
          batchId: input.batchId ?? null,
        });

        const snapshot = {
          quantity: locked.quantity,
          avgCost: locked.avgCost,
          reservedQuantity: locked.reservedQuantity,
        };
        const effect = isIncrease
          ? applyIncrease(snapshot, quantity, toDecimal(input.unitCost!))
          : applyDecrease(snapshot, quantity);

        await tx.stockBalance.update({
          where: { id: locked.id },
          data: { quantity: effect.newQuantity, avgCost: effect.newAvgCost },
        });

        return tx.stockMovement.create({
          data: {
            type: input.type,
            productId: input.productId,
            warehouseId: input.warehouseId,
            batchId: input.batchId ?? null,
            quantity,
            unitCost: effect.movementUnitCost,
            totalCost: quantity.times(effect.movementUnitCost),
            balanceAfter: effect.newQuantity,
            avgCostAfter: effect.newAvgCost,
            reference: input.reference,
            notes: input.notes,
            idempotencyKey: input.idempotencyKey,
            createdByUserId: userId,
          },
        });
      });
    } catch (err) {
      return this.recoverFromIdempotencyRace(err, input.idempotencyKey);
    }
  }

  /**
   * Transferencia entre depositos: DOIS movimentos (saida na origem, entrada
   * no destino) escritos na MESMA transacao, travando as duas linhas de
   * saldo em ordem deterministica (ver lockTwoBalances) para nao formar
   * deadlock com uma transferencia concorrente no sentido oposto.
   *
   * O custo unitario que "viaja" e o avgCost da origem no momento da
   * transferencia — o destino recalcula seu proprio custo medio como se
   * tivesse "comprado" a essa cotacao.
   */
  async transferStock(input: TransferStockInput, userId: string) {
    if (input.sourceWarehouseId === input.targetWarehouseId) {
      throw AppError.validation("Deposito de origem e destino nao podem ser o mesmo");
    }

    const existing = await this.findByIdempotencyKey(`${input.idempotencyKey}:out`);
    if (existing) {
      const pairEntry = await tenantDb().stockMovement.findUnique({
        where: { idempotencyKey: `${input.idempotencyKey}:in` },
      });
      return { out: existing, in: pairEntry };
    }

    const quantity = toDecimal(input.quantity);
    if (!quantity.isPositive()) throw AppError.validation("Quantidade precisa ser maior que zero");

    await this.assertProductAndBatch(input.productId, input.batchId ?? null);
    await this.assertWarehouseExists(input.sourceWarehouseId);
    await this.assertWarehouseExists(input.targetWarehouseId);

    const sourceKey = { productId: input.productId, warehouseId: input.sourceWarehouseId, batchId: input.batchId ?? null };
    const targetKey = { productId: input.productId, warehouseId: input.targetWarehouseId, batchId: input.batchId ?? null };

    try {
      return await tenantDb().$transaction(async (tx) => {
        // lockTwoBalances ja devolve `a` amarrado a sourceKey e `b` a
        // targetKey, INDEPENDENTE da ordem em que travou por dentro — nao
        // reordenar de novo aqui (fazer isso inverteria origem/destino toda
        // vez que o id do deposito de origem vier depois do de destino em
        // ordem alfabetica).
        const { a: source, b: target } = await lockTwoBalances(tx, sourceKey, targetKey);

        const sourceEffect = applyDecrease(
          { quantity: source.quantity, avgCost: source.avgCost, reservedQuantity: source.reservedQuantity },
          quantity,
        );
        await tx.stockBalance.update({
          where: { id: source.id },
          data: { quantity: sourceEffect.newQuantity },
        });

        const targetEffect = applyIncrease(
          { quantity: target.quantity, avgCost: target.avgCost, reservedQuantity: target.reservedQuantity },
          quantity,
          source.avgCost,
        );
        await tx.stockBalance.update({
          where: { id: target.id },
          data: { quantity: targetEffect.newQuantity, avgCost: targetEffect.newAvgCost },
        });

        const outMovement = await tx.stockMovement.create({
          data: {
            type: "TRANSFERENCIA_SAIDA",
            productId: input.productId,
            warehouseId: input.sourceWarehouseId,
            batchId: input.batchId ?? null,
            quantity,
            unitCost: sourceEffect.movementUnitCost,
            totalCost: quantity.times(sourceEffect.movementUnitCost),
            balanceAfter: sourceEffect.newQuantity,
            avgCostAfter: sourceEffect.newAvgCost,
            reference: `transfer:${input.targetWarehouseId}`,
            notes: input.notes,
            idempotencyKey: `${input.idempotencyKey}:out`,
            createdByUserId: userId,
          },
        });

        const inMovement = await tx.stockMovement.create({
          data: {
            type: "TRANSFERENCIA_ENTRADA",
            productId: input.productId,
            warehouseId: input.targetWarehouseId,
            batchId: input.batchId ?? null,
            quantity,
            unitCost: targetEffect.movementUnitCost,
            totalCost: quantity.times(targetEffect.movementUnitCost),
            balanceAfter: targetEffect.newQuantity,
            avgCostAfter: targetEffect.newAvgCost,
            reference: `transfer:${input.sourceWarehouseId}`,
            notes: input.notes,
            idempotencyKey: `${input.idempotencyKey}:in`,
            createdByUserId: userId,
          },
        });

        return { out: outMovement, in: inMovement };
      });
    } catch (err) {
      const recovered = await this.recoverFromIdempotencyRace(err, `${input.idempotencyKey}:out`);
      if (recovered) {
        const pairEntry = await tenantDb().stockMovement.findUnique({
          where: { idempotencyKey: `${input.idempotencyKey}:in` },
        });
        return { out: recovered, in: pairEntry };
      }
      throw err;
    }
  }

  /**
   * Estorna um movimento existente criando um NOVO movimento (tipo ESTORNO)
   * com o efeito oposto — nunca apaga nem edita o original.
   *
   * Simplificacao assumida (custo medio movel, nao custeio por lote): o
   * estorno de uma ENTRADA e tratado como uma saida pelo avgCost ATUAL (nao
   * necessariamente o mesmo custo da entrada original, que pode ja ter sido
   * "diluido" por entradas seguintes). O estorno de uma SAIDA repoe a
   * quantidade ao avgCost original da saida. Para reversao financeira
   * exata por lote, o produto precisaria estar em trackingMode=BATCH.
   */
  async reverseMovement(input: ReverseMovementInput, userId: string) {
    const existing = await this.findByIdempotencyKey(input.idempotencyKey);
    if (existing) return existing;

    const original = await tenantDb().stockMovement.findUnique({ where: { id: input.movementId } });
    if (!original) throw AppError.notFound("Movimento original nao encontrado");
    if (original.type === "ESTORNO") throw AppError.validation("Nao e possivel estornar um estorno");

    const alreadyReversed = await tenantDb().stockMovement.findFirst({ where: { reversalOfId: original.id } });
    if (alreadyReversed) throw AppError.conflict("Este movimento ja foi estornado");

    const wasIncrease = INCREASE_TYPES.has(original.type) || original.type === "TRANSFERENCIA_ENTRADA";

    try {
      return await tenantDb().$transaction(async (tx) => {
        const locked = await lockBalance(tx, {
          productId: original.productId,
          warehouseId: original.warehouseId,
          batchId: original.batchId,
        });
        const snapshot = {
          quantity: locked.quantity,
          avgCost: locked.avgCost,
          reservedQuantity: locked.reservedQuantity,
        };

        // Estornar uma entrada = tira a quantidade (efeito de saida).
        // Estornar uma saida = devolve a quantidade, ao custo que tinha saido.
        const effect = wasIncrease
          ? applyDecrease(snapshot, original.quantity)
          : applyIncrease(snapshot, original.quantity, original.unitCost);

        await tx.stockBalance.update({
          where: { id: locked.id },
          data: { quantity: effect.newQuantity, avgCost: effect.newAvgCost },
        });

        return tx.stockMovement.create({
          data: {
            type: "ESTORNO",
            productId: original.productId,
            warehouseId: original.warehouseId,
            batchId: original.batchId,
            quantity: original.quantity,
            unitCost: effect.movementUnitCost,
            totalCost: original.quantity.times(effect.movementUnitCost),
            balanceAfter: effect.newQuantity,
            avgCostAfter: effect.newAvgCost,
            reference: `estorno de ${original.id}`,
            notes: input.reason,
            idempotencyKey: input.idempotencyKey,
            reversalOfId: original.id,
            createdByUserId: userId,
          },
        });
      });
    } catch (err) {
      return this.recoverFromIdempotencyRace(err, input.idempotencyKey);
    }
  }

  private findByIdempotencyKey(idempotencyKey: string) {
    return tenantDb().stockMovement.findUnique({ where: { idempotencyKey } });
  }

  /**
   * Duas requisicoes com a MESMA idempotencyKey podem passar pela checagem
   * inicial ao mesmo tempo (ainda nao existe linha) e colidir na escrita —
   * a unique constraint de idempotencyKey rejeita a segunda com P2002.
   * Em vez de propagar erro pro cliente que so estava tentando repetir a
   * MESMA operacao com seguranca, devolvemos o resultado que a primeira
   * gravou.
   */
  private async recoverFromIdempotencyRace(err: unknown, idempotencyKey: string) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await this.findByIdempotencyKey(idempotencyKey);
      if (existing) return existing;
    }
    throw err;
  }

  private async assertProductAndBatch(productId: string, batchId: string | null) {
    const product = await tenantDb().product.findUnique({ where: { id: productId } });
    if (!product || !product.active) throw AppError.validation("Produto invalido ou inativo");

    if (product.trackingMode !== "NONE" && !batchId) {
      throw AppError.validation(`Produto exige lote (trackingMode=${product.trackingMode}) — informe batchId`);
    }
    if (batchId) {
      const batch = await tenantDb().batch.findUnique({ where: { id: batchId } });
      if (!batch || batch.productId !== productId) throw AppError.validation("Lote invalido para este produto");
    }
    return product;
  }

  private async assertWarehouseExists(warehouseId: string) {
    const warehouse = await tenantDb().warehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse) throw AppError.validation("Deposito invalido");
  }
}

export const stockLedgerService = new StockLedgerService();

export type { TenantTx };
