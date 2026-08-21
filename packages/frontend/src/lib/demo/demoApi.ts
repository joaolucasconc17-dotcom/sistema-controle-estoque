import { PERMISSIONS } from "@estoque/shared/enums";
import {
  DEMO_BALANCES,
  DEMO_CATEGORIES,
  DEMO_COMPANY_UNITS,
  DEMO_MOVEMENTS,
  DEMO_PRODUCTS,
  DEMO_PURCHASE_ORDERS,
  DEMO_SUPPLIERS,
  DEMO_UNITS_OF_MEASURE,
  DEMO_USER,
  DEMO_WAREHOUSES,
} from "./demoData.js";

/**
 * MODO DEMONSTRACAO — so ativa quando VITE_DEMO_MODE=true no build.
 *
 * Serve para a versao publicada em hospedagem estatica (GitHub Pages), que
 * nao tem backend algum: em vez de toda tela quebrar com erro de rede, o
 * app responde com dados fixos e o visitante navega o sistema inteiro.
 *
 * Nao interfere no sistema real: quando a flag esta desligada (dev local e
 * qualquer deploy com backend), este modulo nunca e chamado — apiClient
 * segue direto pro fetch de verdade.
 */
export const IS_DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

const page = <T>(items: T[]) => ({ items, nextCursor: null });

function matchesSearch(haystack: string, needle: string) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Roteia um path da API para dados de demonstracao. Devolve `undefined`
 * quando a rota nao e conhecida — nesse caso apiClient devolve um erro
 * explicito em vez de fingir sucesso com dado vazio.
 */
export function resolveDemoResponse(path: string, method: string): unknown | undefined {
  // Escritas nao sao suportadas no modo demo: os dados sao fixos e nao ha
  // onde persistir. Sinalizado com um erro claro (tratado em apiClient).
  if (method !== "GET") return DEMO_WRITE_BLOCKED;

  const [rawPath, rawQuery] = path.split("?");
  const query = new URLSearchParams(rawQuery ?? "");
  const url = rawPath ?? "";

  if (url === "/auth/me") {
    return { auth: { ...DEMO_USER, permissions: [...PERMISSIONS] } };
  }

  if (url === "/catalog/units-of-measure") return DEMO_UNITS_OF_MEASURE;
  if (url === "/catalog/categories") return DEMO_CATEGORIES;

  if (url === "/catalog/products") {
    const search = query.get("search");
    const items = search
      ? DEMO_PRODUCTS.filter((p) => matchesSearch(p.name, search) || matchesSearch(p.sku, search))
      : DEMO_PRODUCTS;
    return page(items);
  }
  if (url.startsWith("/catalog/products/")) {
    const id = url.split("/").pop();
    return DEMO_PRODUCTS.find((p) => p.id === id) ?? DEMO_PRODUCTS[0];
  }

  if (url === "/catalog/suppliers") return page(DEMO_SUPPLIERS);
  if (url.startsWith("/catalog/suppliers/")) {
    const id = url.split("/").pop();
    const supplier = DEMO_SUPPLIERS.find((s) => s.id === id) ?? DEMO_SUPPLIERS[0];
    return { ...supplier, products: [] };
  }

  if (url === "/org/company-units") return page(DEMO_COMPANY_UNITS);
  if (url === "/org/warehouses") return page(DEMO_WAREHOUSES);

  if (url === "/inventory/balances") {
    const productId = query.get("productId");
    const items = productId ? DEMO_BALANCES.filter((b) => b.productId === productId) : DEMO_BALANCES;
    return page(items);
  }
  if (url.startsWith("/inventory/kardex/")) return page(DEMO_MOVEMENTS);

  if (url === "/purchasing/orders") return page(DEMO_PURCHASE_ORDERS);
  if (url.startsWith("/purchasing/orders/")) {
    const id = url.split("/").pop();
    return DEMO_PURCHASE_ORDERS.find((o) => o.id === id) ?? DEMO_PURCHASE_ORDERS[0];
  }

  if (url.startsWith("/reports/")) return resolveDemoReport(url);

  return undefined;
}

export const DEMO_WRITE_BLOCKED = Symbol("demo-write-blocked");

function resolveDemoReport(url: string): unknown {
  const valuationItems = DEMO_BALANCES.map((b) => ({
    productId: b.productId,
    sku: b.product.sku,
    name: b.product.name,
    quantity: b.quantity,
    value: (Number(b.quantity) * Number(b.avgCost)).toFixed(2),
  })).sort((a, b) => Number(b.value) - Number(a.value));

  const totalValue = valuationItems.reduce((acc, i) => acc + Number(i.value), 0);

  if (url.startsWith("/reports/dashboard")) {
    return {
      totalStockValue: totalValue.toFixed(2),
      activeProductCount: DEMO_PRODUCTS.length,
      lowStockCount: lowStockItems().length,
      expiringBatchCount: 0,
      topValueProducts: valuationItems.slice(0, 5),
    };
  }

  if (url.startsWith("/reports/valuation")) {
    return { totalValue: totalValue.toFixed(2), items: valuationItems };
  }

  if (url.startsWith("/reports/abc-curve")) {
    let cumulative = 0;
    return {
      items: valuationItems.map((item) => {
        const pctBefore = (cumulative / totalValue) * 100;
        const classification = pctBefore < 80 ? "A" : pctBefore < 95 ? "B" : "C";
        cumulative += Number(item.value);
        return { ...item, cumulativePct: ((cumulative / totalValue) * 100).toFixed(2), classification };
      }),
    };
  }

  if (url.startsWith("/reports/low-stock")) return { items: lowStockItems() };
  if (url.startsWith("/reports/expiring-batches")) return { items: [] };
  if (url.startsWith("/reports/stale-products")) {
    return { sinceDays: 90, items: valuationItems.slice(-2) };
  }
  if (url.startsWith("/reports/turnover")) {
    return {
      periodDays: 30,
      items: DEMO_BALANCES.slice(0, 6).map((b) => {
        const sold = Math.round(Number(b.quantity) * 0.4);
        const rate = Number(b.quantity) === 0 ? null : (sold / Number(b.quantity)).toFixed(2);
        return {
          productId: b.productId,
          sku: b.product.sku,
          name: b.product.name,
          soldQuantity: String(sold),
          currentQuantity: b.quantity,
          turnoverRate: rate,
          daysOfCoverage: sold === 0 ? null : ((Number(b.quantity) / (sold / 30)) as number).toFixed(1),
        };
      }),
    };
  }

  return { items: [] };
}

function lowStockItems() {
  return DEMO_PRODUCTS.flatMap((p) => {
    const balance = DEMO_BALANCES.find((b) => b.productId === p.id);
    if (!balance || !p.minStock) return [];
    if (Number(balance.quantity) >= Number(p.minStock)) return [];
    return [{
      productId: p.id,
      sku: p.sku,
      name: p.name,
      quantity: balance.quantity,
      minStock: p.minStock,
      status: Number(balance.quantity) === 0 ? "RUPTURA" : "ABAIXO_MINIMO",
    }];
  });
}
