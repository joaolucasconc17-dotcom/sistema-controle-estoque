/**
 * Dados fixos do MODO DEMONSTRACAO.
 *
 * Existem para que a versao publicada em hospedagem estatica (GitHub Pages)
 * consiga mostrar o sistema funcionando sem nenhum backend no ar. Nada aqui
 * e usado quando o app roda contra a API de verdade — ver demoApi.ts.
 */

export const DEMO_WAREHOUSES = [
  { id: "wh-1", name: "Deposito Central", code: "DC", companyUnitId: "cu-1" },
  { id: "wh-2", name: "Deposito Sul", code: "DS", companyUnitId: "cu-2" },
];

export const DEMO_COMPANY_UNITS = [
  { id: "cu-1", name: "Matriz", code: "MTZ", active: true },
  { id: "cu-2", name: "Filial Sul", code: "FSU", active: true },
];

export const DEMO_UNITS_OF_MEASURE = [
  { id: "uom-1", code: "UN", name: "Unidade" },
  { id: "uom-2", code: "CX", name: "Caixa" },
  { id: "uom-3", code: "KG", name: "Quilograma" },
  { id: "uom-4", code: "L", name: "Litro" },
  { id: "uom-5", code: "M", name: "Metro" },
];

export const DEMO_CATEGORIES = [
  { id: "cat-1", name: "Eletronicos", parentId: null },
  { id: "cat-2", name: "Papelaria", parentId: null },
  { id: "cat-3", name: "Limpeza", parentId: null },
];

interface DemoProductSeed {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  costPrice: string;
  salePrice: string;
  minStock: string;
  qty: number;
  avgCost: string;
  reserved?: string;
}

const PRODUCT_SEEDS: DemoProductSeed[] = [
  { id: "p-1", sku: "ELE-001", name: "Mouse sem fio Logitech M170", categoryId: "cat-1", costPrice: "45.00", salePrice: "89.90", minStock: "20", qty: 105, avgCost: "45.00", reserved: "25" },
  { id: "p-2", sku: "ELE-002", name: "Teclado ABNT2 USB", categoryId: "cat-1", costPrice: "70.00", salePrice: "139.90", minStock: "15", qty: 43, avgCost: "70.00" },
  { id: "p-3", sku: "ELE-003", name: "Monitor 24 polegadas Full HD", categoryId: "cat-1", costPrice: "780.00", salePrice: "1249.00", minStock: "5", qty: 17, avgCost: "780.00" },
  { id: "p-4", sku: "ELE-004", name: "Headset com microfone", categoryId: "cat-1", costPrice: "120.00", salePrice: "229.90", minStock: "10", qty: 60, avgCost: "120.00" },
  { id: "p-5", sku: "PAP-001", name: "Papel A4 75g (resma 500fl)", categoryId: "cat-2", costPrice: "24.00", salePrice: "39.90", minStock: "50", qty: 115, avgCost: "24.00" },
  { id: "p-6", sku: "PAP-002", name: "Caneta esferografica azul", categoryId: "cat-2", costPrice: "1.20", salePrice: "2.99", minStock: "200", qty: 580, avgCost: "1.20" },
  { id: "p-7", sku: "PAP-003", name: "Bloco de notas autoadesivo", categoryId: "cat-2", costPrice: "4.50", salePrice: "9.90", minStock: "80", qty: 205, avgCost: "4.50" },
  { id: "p-8", sku: "LIM-001", name: "Detergente neutro 5L", categoryId: "cat-3", costPrice: "18.00", salePrice: "34.90", minStock: "30", qty: 12, avgCost: "18.00" },
  { id: "p-9", sku: "LIM-002", name: "Alcool 70% 1L", categoryId: "cat-3", costPrice: "8.50", salePrice: "16.90", minStock: "40", qty: 18, avgCost: "8.50" },
];

export const DEMO_PRODUCTS = PRODUCT_SEEDS.map((p) => ({
  id: p.id,
  sku: p.sku,
  name: p.name,
  categoryId: p.categoryId,
  unitOfMeasureId: "uom-1",
  trackingMode: "NONE",
  costPrice: p.costPrice,
  salePrice: p.salePrice,
  minStock: p.minStock,
  maxStock: null,
  reorderPoint: null,
  leadTimeDays: null,
  active: true,
  barcodes: [],
  category: DEMO_CATEGORIES.find((c) => c.id === p.categoryId) ?? null,
  unitOfMeasure: DEMO_UNITS_OF_MEASURE[0],
}));

export const DEMO_BALANCES = PRODUCT_SEEDS.map((p, i) => ({
  id: `bal-${i + 1}`,
  productId: p.id,
  warehouseId: "wh-1",
  batchId: null,
  quantity: String(p.qty),
  reservedQuantity: p.reserved ?? "0",
  avgCost: p.avgCost,
  product: { sku: p.sku, name: p.name },
  warehouse: { name: "Deposito Central", code: "DC" },
}));

export const DEMO_SUPPLIERS = [
  { id: "sup-1", legalName: "TechDistribuidora LTDA", tradeName: "TechDist", document: "12345678000190", email: "vendas@techdist.com.br", phone: null, active: true },
  { id: "sup-2", legalName: "Papel & Cia Comercio LTDA", tradeName: "Papel & Cia", document: "98765432000110", email: "contato@papelcia.com.br", phone: null, active: true },
];

const DAY = 86_400_000;

export const DEMO_PURCHASE_ORDERS = [
  {
    id: "po-1",
    status: "APPROVED",
    expectedDate: new Date(Date.now() + 5 * DAY).toISOString(),
    createdAt: new Date(Date.now() - 2 * DAY).toISOString(),
    supplierId: "sup-1",
    warehouseId: "wh-1",
    supplier: { legalName: "TechDistribuidora LTDA" },
    warehouse: { name: "Deposito Central" },
    items: [
      { id: "poi-1", productId: "p-8", quantity: "60", unitCost: "17.50", receivedQuantity: "0", product: { sku: "LIM-001", name: "Detergente neutro 5L" } },
      { id: "poi-2", productId: "p-9", quantity: "80", unitCost: "8.20", receivedQuantity: "0", product: { sku: "LIM-002", name: "Alcool 70% 1L" } },
    ],
  },
  {
    id: "po-2",
    status: "DRAFT",
    expectedDate: null,
    createdAt: new Date(Date.now() - 1 * DAY).toISOString(),
    supplierId: "sup-2",
    warehouseId: "wh-1",
    supplier: { legalName: "Papel & Cia Comercio LTDA" },
    warehouse: { name: "Deposito Central" },
    items: [
      { id: "poi-3", productId: "p-5", quantity: "150", unitCost: "23.50", receivedQuantity: "0", product: { sku: "PAP-001", name: "Papel A4 75g (resma 500fl)" } },
    ],
  },
];

/** Kardex de exemplo — usado para qualquer produto no modo demo. */
export const DEMO_MOVEMENTS = [
  { id: "mv-1", type: "ENTRADA", quantity: "150", unitCost: "45.00", totalCost: "6750.00", balanceAfter: "150", avgCostAfter: "45.00", reference: "carga inicial", createdAt: new Date(Date.now() - 10 * DAY).toISOString() },
  { id: "mv-2", type: "SAIDA", quantity: "45", unitCost: "45.00", totalCost: "2025.00", balanceAfter: "105", avgCostAfter: "45.00", reference: "venda balcao", createdAt: new Date(Date.now() - 4 * DAY).toISOString() },
  { id: "mv-3", type: "TRANSFERENCIA_SAIDA", quantity: "15", unitCost: "45.00", totalCost: "675.00", balanceAfter: "90", avgCostAfter: "45.00", reference: "transfer:wh-2", createdAt: new Date(Date.now() - 2 * DAY).toISOString() },
  { id: "mv-4", type: "TRANSFERENCIA_ENTRADA", quantity: "15", unitCost: "45.00", totalCost: "675.00", balanceAfter: "105", avgCostAfter: "45.00", reference: "transfer:wh-1", createdAt: new Date(Date.now() - 2 * DAY).toISOString() },
];

export const DEMO_USER = {
  id: "demo-user",
  name: "Visitante (demonstracao)",
  email: "demo@exemplo.com",
  tenantId: "demo-tenant",
  tenantSlug: "demonstracao",
  roles: ["ADMIN"] as const,
};
