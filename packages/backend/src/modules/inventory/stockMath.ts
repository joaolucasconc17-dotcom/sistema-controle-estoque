import { Prisma } from "../../generated/tenant/index.js";
import { AppError } from "../../platform/errors.js";

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

export interface BalanceSnapshot {
  quantity: Decimal;
  avgCost: Decimal;
  reservedQuantity: Decimal;
}

export interface BalanceEffect {
  newQuantity: Decimal;
  newAvgCost: Decimal;
  /** Custo unitario a gravar NO MOVIMENTO (nem sempre igual ao avgCost novo — numa saida e o avgCost ANTES da saida). */
  movementUnitCost: Decimal;
}

/**
 * Entrada de estoque (compra, ajuste positivo, estorno de saida): recalcula
 * o custo medio ponderado movel. Formula classica de custo medio movel —
 * cada entrada "dilui" o custo pela quantidade e preco que chegou.
 */
export function applyIncrease(balance: BalanceSnapshot, quantity: Decimal, unitCost: Decimal): BalanceEffect {
  const newQuantity = balance.quantity.plus(quantity);
  const previousValue = balance.quantity.times(balance.avgCost);
  const incomingValue = quantity.times(unitCost);
  const newAvgCost = newQuantity.isZero() ? unitCost : previousValue.plus(incomingValue).dividedBy(newQuantity);

  return { newQuantity, newAvgCost, movementUnitCost: unitCost };
}

/**
 * Saida de estoque (venda, ajuste negativo, estorno de entrada): o custo
 * medio NAO muda (so entradas alteram o custo medio). O custo gravado no
 * movimento e o avgCost vigente no momento da saida — e o que sai valendo.
 *
 * A checagem usa o saldo DISPONIVEL (fisico - reservado), nao o fisico
 * bruto — uma saida avulsa nao pode consumir estoque que ja esta
 * comprometido com uma reserva de outro pedido. Lanca INSUFFICIENT_STOCK
 * quando excede. Combinado com o lock em StockLedgerService, isso e o que
 * impede duas baixas concorrentes derrubarem o saldo abaixo de zero.
 */
export function applyDecrease(balance: BalanceSnapshot, quantity: Decimal): BalanceEffect {
  const available = balance.quantity.minus(balance.reservedQuantity);
  if (quantity.greaterThan(available)) {
    throw AppError.insufficientStock(
      `Saldo disponivel insuficiente: disponivel ${available.toString()}, solicitado ${quantity.toString()}`,
    );
  }
  const newQuantity = balance.quantity.minus(quantity);
  return { newQuantity, newAvgCost: balance.avgCost, movementUnitCost: balance.avgCost };
}

export function toDecimal(value: Decimal | string | number): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}
