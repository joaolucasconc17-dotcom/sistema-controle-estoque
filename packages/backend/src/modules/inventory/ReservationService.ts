import type { CreateReservationInput } from "@estoque/shared";
import { Prisma } from "../../generated/tenant/index.js";
import { tenantDb } from "../../platform/tenant/tenantContext.js";
import { AppError } from "../../platform/errors.js";
import { applyDecrease, toDecimal } from "./stockMath.js";
import { lockBalance } from "./balanceLock.js";

/**
 * Reservas separam "fisico" (stock_balance.quantity) de "disponivel"
 * (fisico - reservado). Reservar NAO baixa estoque — so marca compromisso.
 * A baixa de verdade acontece em `fulfill` (separacao/expedicao).
 *
 * Nota deliberada: os metodos aqui NAO chamam StockLedgerService, mesmo
 * fulfill() gravando um movimento de saida — cada metodo publico daquela
 * classe abre sua PROPRIA transacao Prisma, e chamar um de dentro da
 * transacao desta classe criaria uma segunda transacao concorrente
 * tentando travar a MESMA linha ja travada pela primeira = deadlock consigo
 * mesma. Por isso a logica de saida esta duplicada aqui, no nivel certo
 * (reaproveitando so as funcoes puras de stockMath e o lock).
 */
export class ReservationService {
  async create(input: CreateReservationInput, _userId: string) {
    const existing = await tenantDb().stockReservation.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return existing;

    const quantity = toDecimal(input.quantity);
    if (!quantity.isPositive()) throw AppError.validation("Quantidade precisa ser maior que zero");

    try {
      return await tenantDb().$transaction(async (tx) => {
        const locked = await lockBalance(tx, {
          productId: input.productId,
          warehouseId: input.warehouseId,
          batchId: null,
        });
        const available = locked.quantity.minus(locked.reservedQuantity);
        if (quantity.greaterThan(available)) {
          throw AppError.insufficientStock(
            `Saldo disponivel insuficiente para reservar: disponivel ${available.toString()}, solicitado ${quantity.toString()}`,
          );
        }

        await tx.stockBalance.update({
          where: { id: locked.id },
          data: { reservedQuantity: locked.reservedQuantity.plus(quantity) },
        });

        return tx.stockReservation.create({
          data: {
            productId: input.productId,
            warehouseId: input.warehouseId,
            quantity,
            reference: input.reference,
            idempotencyKey: input.idempotencyKey,
          },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const raced = await tenantDb().stockReservation.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
        if (raced) return raced;
      }
      throw err;
    }
  }

  async cancel(reservationId: string) {
    return tenantDb().$transaction(async (tx) => {
      const reservation = await tx.stockReservation.findUnique({ where: { id: reservationId } });
      if (!reservation) throw AppError.notFound("Reserva nao encontrada");
      if (reservation.status !== "ACTIVE") throw AppError.conflict(`Reserva ja esta ${reservation.status}`);

      const locked = await lockBalance(tx, {
        productId: reservation.productId,
        warehouseId: reservation.warehouseId,
        batchId: null,
      });
      await tx.stockBalance.update({
        where: { id: locked.id },
        data: { reservedQuantity: locked.reservedQuantity.minus(reservation.quantity) },
      });

      return tx.stockReservation.update({ where: { id: reservationId }, data: { status: "CANCELLED" } });
    });
  }

  /** Separacao/expedicao: baixa fisica de verdade + libera a reserva, atomicamente. */
  async fulfill(reservationId: string, userId: string) {
    return tenantDb().$transaction(async (tx) => {
      const reservation = await tx.stockReservation.findUnique({ where: { id: reservationId } });
      if (!reservation) throw AppError.notFound("Reserva nao encontrada");
      if (reservation.status !== "ACTIVE") throw AppError.conflict(`Reserva ja esta ${reservation.status}`);

      const locked = await lockBalance(tx, {
        productId: reservation.productId,
        warehouseId: reservation.warehouseId,
        batchId: null,
      });

      // reservedQuantity=0 aqui de proposito: applyDecrease normalmente exige
      // quantity <= (fisico - reservado), mas fulfill esta CONSUMINDO a
      // propria reserva, entao o limite certo e so o fisico. Isso e seguro
      // porque reservedQuantity <= quantity e um invariante mantido por
      // create()/recordMovement — a reserva nunca excede o fisico.
      const effect = applyDecrease(
        { quantity: locked.quantity, avgCost: locked.avgCost, reservedQuantity: new Prisma.Decimal(0) },
        reservation.quantity,
      );
      // reservedQuantity cai junto com a fisica (a reserva desta linha esta sendo consumida agora).
      await tx.stockBalance.update({
        where: { id: locked.id },
        data: {
          quantity: effect.newQuantity,
          reservedQuantity: locked.reservedQuantity.minus(reservation.quantity),
        },
      });

      const movement = await tx.stockMovement.create({
        data: {
          type: "SAIDA",
          productId: reservation.productId,
          warehouseId: reservation.warehouseId,
          quantity: reservation.quantity,
          unitCost: effect.movementUnitCost,
          totalCost: reservation.quantity.times(effect.movementUnitCost),
          balanceAfter: effect.newQuantity,
          avgCostAfter: effect.newAvgCost,
          reference: reservation.reference ?? `reserva:${reservation.id}`,
          idempotencyKey: `reservation-fulfill:${reservation.id}`,
          createdByUserId: userId,
        },
      });

      const updatedReservation = await tx.stockReservation.update({
        where: { id: reservationId },
        data: { status: "FULFILLED" },
      });

      return { reservation: updatedReservation, movement };
    });
  }
}

export const reservationService = new ReservationService();
