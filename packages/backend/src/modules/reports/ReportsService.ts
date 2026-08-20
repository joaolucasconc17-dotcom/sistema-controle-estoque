import { Prisma } from "../../generated/tenant/index.js";
import { tenantDb } from "../../platform/tenant/tenantContext.js";
import { toDecimal } from "../inventory/stockMath.js";

/**
 * Relatorios sincronos: para o volume de um MVP, ler direto e mais simples
 * e mais rapido de entregar do que orquestrar filas. Em escala grande
 * (milhoes de stock_movement), os relatorios que varrem periodo — giro,
 * curva ABC — sao os primeiros candidatos a virar job em BullMQ, mas a
 * FORMA de resposta destes metodos ja e a mesma que um job devolveria, entao
 * mover pra fila depois nao muda o contrato da API.
 */
export class ReportsService {
  /** Valor total em estoque a custo medio, por produto e no agregado. */
  async valuation(warehouseId?: string) {
    const balances = await tenantDb().stockBalance.findMany({
      where: { warehouseId, quantity: { gt: 0 } },
      include: { product: { select: { id: true, sku: true, name: true } }, warehouse: { select: { name: true } } },
    });

    const byProduct = new Map<string, { productId: string; sku: string; name: string; quantity: Prisma.Decimal; value: Prisma.Decimal }>();
    let total = toDecimal(0);

    for (const balance of balances) {
      const value = balance.quantity.times(balance.avgCost);
      total = total.plus(value);

      const key = balance.productId;
      const acc = byProduct.get(key) ?? {
        productId: balance.productId,
        sku: balance.product.sku,
        name: balance.product.name,
        quantity: toDecimal(0),
        value: toDecimal(0),
      };
      acc.quantity = acc.quantity.plus(balance.quantity);
      acc.value = acc.value.plus(value);
      byProduct.set(key, acc);
    }

    const items = [...byProduct.values()]
      .sort((a, b) => b.value.comparedTo(a.value))
      .map((i) => ({ ...i, quantity: i.quantity.toString(), value: i.value.toString() }));

    return { totalValue: total.toString(), items };
  }

  /**
   * Curva ABC por valor em estoque: A = ate 80% do valor acumulado,
   * B = ate 95%, C = o resto. Classificacao classica de gestao de estoque
   * para priorizar contagem/atencao nos itens que mais pesam no capital
   * imobilizado.
   */
  async abcCurve(warehouseId?: string) {
    const { items, totalValue } = await this.valuation(warehouseId);
    const total = toDecimal(totalValue);
    if (total.isZero()) return { items: [] };

    let cumulative = toDecimal(0);
    return {
      items: items.map((item) => {
        // Classifica pelo cumulativo ANTES de somar este item, nao depois:
        // um item sozinho que ja responde por 94% do valor precisa ser A
        // (ele PROPRIO forma o topo dos 80%) — classificar pelo cumulativo
        // apos soma-lo jogaria esse item pra B, o que contraria a logica da
        // curva ABC (agrupar os poucos itens que concentram a maior parte
        // do valor).
        const cumulativeBefore = cumulative.dividedBy(total).times(100);
        const classification = cumulativeBefore.lessThan(80) ? "A" : cumulativeBefore.lessThan(95) ? "B" : "C";
        cumulative = cumulative.plus(item.value);
        const cumulativePct = cumulative.dividedBy(total).times(100);
        return { ...item, cumulativePct: cumulativePct.toFixed(2), classification };
      }),
    };
  }

  /** Produtos com saldo zerado (ruptura) ou abaixo do minimo cadastrado. */
  async lowStock(warehouseId?: string) {
    const products = await tenantDb().product.findMany({
      where: { active: true, minStock: { not: null } },
      select: { id: true, sku: true, name: true, minStock: true },
    });
    if (products.length === 0) return { items: [] };

    const balances = await tenantDb().stockBalance.groupBy({
      by: ["productId"],
      where: { warehouseId, productId: { in: products.map((p) => p.id) } },
      _sum: { quantity: true },
    });
    const qtyByProduct = new Map(balances.map((b) => [b.productId, b._sum.quantity ?? toDecimal(0)]));

    const items = products
      .map((p) => {
        const quantity = qtyByProduct.get(p.id) ?? toDecimal(0);
        return { productId: p.id, sku: p.sku, name: p.name, quantity: quantity.toString(), minStock: p.minStock!.toString(), status: quantity.isZero() ? "RUPTURA" : "ABAIXO_MINIMO" };
      })
      .filter((i) => toDecimal(i.quantity).lessThan(toDecimal(i.minStock)));

    return { items };
  }

  /** Produtos sem NENHUMA movimentacao nos ultimos `days` dias mas com saldo positivo — capital parado. */
  async staleProducts(days: number, warehouseId?: string) {
    const since = new Date(Date.now() - days * 86_400_000);

    const balances = await tenantDb().stockBalance.findMany({
      where: { warehouseId, quantity: { gt: 0 } },
      include: { product: { select: { id: true, sku: true, name: true } } },
    });

    const recentMovements = await tenantDb().stockMovement.findMany({
      where: { createdAt: { gte: since }, productId: { in: balances.map((b) => b.productId) } },
      select: { productId: true },
      distinct: ["productId"],
    });
    const recentlyMovedIds = new Set(recentMovements.map((m) => m.productId));

    const items = balances
      .filter((b) => !recentlyMovedIds.has(b.productId))
      .map((b) => ({ productId: b.productId, sku: b.product.sku, name: b.product.name, quantity: b.quantity.toString(), value: b.quantity.times(b.avgCost).toString() }));

    return { sinceDays: days, items };
  }

  /** Lotes vencendo nos proximos `days` dias (FEFO: o que teoricamente deveria sair primeiro). */
  async expiringBatches(days: number) {
    const until = new Date(Date.now() + days * 86_400_000);
    const batches = await tenantDb().batch.findMany({
      where: { expirationDate: { not: null, lte: until } },
      include: { product: { select: { sku: true, name: true } }, balances: { where: { quantity: { gt: 0 } } } },
      orderBy: { expirationDate: "asc" },
    });

    return {
      items: batches
        .filter((b) => b.balances.some((bal) => bal.quantity.greaterThan(0)))
        .map((b) => ({
          batchId: b.id,
          code: b.code,
          productSku: b.product.sku,
          productName: b.product.name,
          expirationDate: b.expirationDate,
          quantity: b.balances.reduce((acc, bal) => acc.plus(bal.quantity), toDecimal(0)).toString(),
        })),
    };
  }

  /**
   * Giro de estoque + cobertura em dias, por produto, num periodo.
   *
   * Simplificacao assumida: usa o saldo ATUAL como proxy do estoque medio
   * do periodo (o correto seria a media entre saldo inicial e final do
   * periodo, que exigiria snapshot historico — fora do escopo do MVP).
   * Documentado aqui para nao ser confundido com o calculo contabil exato.
   */
  async turnover(days: number, warehouseId?: string) {
    const since = new Date(Date.now() - days * 86_400_000);

    const sales = await tenantDb().stockMovement.groupBy({
      by: ["productId"],
      where: { type: "SAIDA", createdAt: { gte: since }, warehouseId },
      _sum: { quantity: true },
    });
    if (sales.length === 0) return { periodDays: days, items: [] };

    const balances = await tenantDb().stockBalance.groupBy({
      by: ["productId"],
      where: { warehouseId, productId: { in: sales.map((s) => s.productId) } },
      _sum: { quantity: true },
    });
    const qtyByProduct = new Map(balances.map((b) => [b.productId, b._sum.quantity ?? toDecimal(0)]));

    const products = await tenantDb().product.findMany({
      where: { id: { in: sales.map((s) => s.productId) } },
      select: { id: true, sku: true, name: true },
    });
    const productById = new Map(products.map((p) => [p.id, p]));

    const items = sales.map((s) => {
      const product = productById.get(s.productId)!;
      const soldQty = s._sum.quantity ?? toDecimal(0);
      const currentQty = qtyByProduct.get(s.productId) ?? toDecimal(0);
      const dailyAvgConsumption = soldQty.dividedBy(days);
      const daysOfCoverage = dailyAvgConsumption.isZero() ? null : currentQty.dividedBy(dailyAvgConsumption).toFixed(1);
      const turnoverRate = currentQty.isZero() ? null : soldQty.dividedBy(currentQty).toFixed(2);

      return {
        productId: s.productId,
        sku: product.sku,
        name: product.name,
        soldQuantity: soldQty.toString(),
        currentQuantity: currentQty.toString(),
        turnoverRate,
        daysOfCoverage,
      };
    });

    return { periodDays: days, items: items.sort((a, b) => Number(b.turnoverRate ?? 0) - Number(a.turnoverRate ?? 0)) };
  }

  async dashboard(warehouseId?: string) {
    const [valuation, lowStock, expiring] = await Promise.all([
      this.valuation(warehouseId),
      this.lowStock(warehouseId),
      this.expiringBatches(30),
    ]);
    const activeProductCount = await tenantDb().product.count({ where: { active: true } });

    return {
      totalStockValue: valuation.totalValue,
      activeProductCount,
      lowStockCount: lowStock.items.length,
      expiringBatchCount: expiring.items.length,
      topValueProducts: valuation.items.slice(0, 5),
    };
  }
}

export const reportsService = new ReportsService();
