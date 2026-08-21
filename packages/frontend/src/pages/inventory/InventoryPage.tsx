import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { CursorPage } from "@estoque/shared";
import { api, ApiError } from "../../lib/apiClient";
import { formatQuantity, formatMoney } from "../../lib/format";

interface Product { id: string; sku: string; name: string }
interface Warehouse { id: string; name: string; code: string }
interface Balance {
  id: string;
  quantity: string;
  reservedQuantity: string;
  avgCost: string;
  product: { sku: string; name: string };
  warehouse: { name: string; code: string };
}

const MOVEMENT_TYPES = [
  { value: "ENTRADA", label: "Entrada" },
  { value: "SAIDA", label: "Saida" },
  { value: "AJUSTE_POSITIVO", label: "Ajuste positivo" },
  { value: "AJUSTE_NEGATIVO", label: "Ajuste negativo" },
];

export function InventoryPage() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"movement" | "transfer">("movement");
  const [formError, setFormError] = useState<string | null>(null);
  const [formOk, setFormOk] = useState<string | null>(null);

  const productsQuery = useQuery({
    queryKey: ["products", "for-movement"],
    queryFn: () => api.get<CursorPage<Product>>("/catalog/products?limit=200"),
  });
  const warehousesQuery = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => api.get<CursorPage<Warehouse>>("/org/warehouses?limit=100"),
  });
  const balancesQuery = useQuery({
    queryKey: ["balances"],
    queryFn: () => api.get<CursorPage<Balance>>("/inventory/balances?limit=100"),
  });

  const movementMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post("/inventory/movements", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balances"] });
      setFormOk("Movimento registrado com sucesso.");
      setFormError(null);
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : "Erro ao registrar movimento");
      setFormOk(null);
    },
  });

  const transferMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post("/inventory/transfers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balances"] });
      setFormOk("Transferencia registrada com sucesso.");
      setFormError(null);
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : "Erro ao transferir");
      setFormOk(null);
    },
  });

  function handleMovementSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setFormOk(null);
    const form = new FormData(e.currentTarget);
    const type = form.get("type");
    const isIncrease = type === "ENTRADA" || type === "AJUSTE_POSITIVO";
    movementMutation.mutate({
      idempotencyKey: crypto.randomUUID(),
      type,
      productId: form.get("productId"),
      warehouseId: form.get("warehouseId"),
      quantity: form.get("quantity"),
      ...(isIncrease ? { unitCost: form.get("unitCost") } : {}),
      reference: form.get("reference") || undefined,
    });
    e.currentTarget.reset();
  }

  function handleTransferSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setFormOk(null);
    const form = new FormData(e.currentTarget);
    transferMutation.mutate({
      idempotencyKey: crypto.randomUUID(),
      productId: form.get("productId"),
      sourceWarehouseId: form.get("sourceWarehouseId"),
      targetWarehouseId: form.get("targetWarehouseId"),
      quantity: form.get("quantity"),
    });
    e.currentTarget.reset();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Movimentacoes de estoque</h1>

      <div className="card">
        <div className="mb-4 flex gap-2">
          <button className={mode === "movement" ? "btn-primary" : "btn-secondary"} onClick={() => setMode("movement")}>
            Entrada / Saida / Ajuste
          </button>
          <button className={mode === "transfer" ? "btn-primary" : "btn-secondary"} onClick={() => setMode("transfer")}>
            Transferencia
          </button>
        </div>

        {mode === "movement" ? (
          <form onSubmit={handleMovementSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="label">Tipo</label>
              <select name="type" required className="input">
                {MOVEMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Produto</label>
              <select name="productId" required className="input">
                <option value="">Selecione...</option>
                {productsQuery.data?.items.map((p) => (
                  <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Deposito</label>
              <select name="warehouseId" required className="input">
                <option value="">Selecione...</option>
                {warehousesQuery.data?.items.map((w) => (
                  <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Quantidade</label>
              <input name="quantity" type="number" step="0.0001" required className="input" />
            </div>
            <div>
              <label className="label">Custo unitario (entrada/ajuste +)</label>
              <input name="unitCost" type="number" step="0.0001" className="input" />
            </div>
            <div>
              <label className="label">Referencia</label>
              <input name="reference" className="input" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              {formError && <p className="mb-2 text-sm text-red-400">{formError}</p>}
              {formOk && <p className="mb-2 text-sm text-emerald-400">{formOk}</p>}
              <button type="submit" className="btn-primary" disabled={movementMutation.isPending}>
                {movementMutation.isPending ? "Registrando..." : "Registrar movimento"}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleTransferSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label">Produto</label>
              <select name="productId" required className="input">
                <option value="">Selecione...</option>
                {productsQuery.data?.items.map((p) => (
                  <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Deposito origem</label>
              <select name="sourceWarehouseId" required className="input">
                <option value="">Selecione...</option>
                {warehousesQuery.data?.items.map((w) => (
                  <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Deposito destino</label>
              <select name="targetWarehouseId" required className="input">
                <option value="">Selecione...</option>
                {warehousesQuery.data?.items.map((w) => (
                  <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Quantidade</label>
              <input name="quantity" type="number" step="0.0001" required className="input" />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              {formError && <p className="mb-2 text-sm text-red-400">{formError}</p>}
              {formOk && <p className="mb-2 text-sm text-emerald-400">{formOk}</p>}
              <button type="submit" className="btn-primary" disabled={transferMutation.isPending}>
                {transferMutation.isPending ? "Transferindo..." : "Transferir"}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="card">
        <h2 className="mb-4 text-sm font-semibold text-slate-300">Saldos atuais</h2>
        <table className="table-base">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Produto</th>
              <th>Deposito</th>
              <th>Fisico</th>
              <th>Reservado</th>
              <th>Disponivel</th>
              <th>Custo medio</th>
              <th>Valor</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {balancesQuery.data?.items.length === 0 && (
              <tr><td colSpan={9} className="py-6 text-center text-slate-500">Sem saldo registrado</td></tr>
            )}
            {balancesQuery.data?.items.map((b) => {
              const available = (Number(b.quantity) - Number(b.reservedQuantity)).toString();
              return (
                <tr key={b.id}>
                  <td className="font-mono text-xs">{b.product.sku}</td>
                  <td>{b.product.name}</td>
                  <td>{b.warehouse.code}</td>
                  <td>{formatQuantity(b.quantity)}</td>
                  <td>{formatQuantity(b.reservedQuantity)}</td>
                  <td>{formatQuantity(available)}</td>
                  <td>{formatMoney(b.avgCost)}</td>
                  <td>{formatMoney(Number(b.quantity) * Number(b.avgCost))}</td>
                  <td />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        Veja o historico completo de um produto (Kardex) na pagina de{" "}
        <Link to="/products" className="text-brand-400 hover:underline">Produtos</Link>.
      </p>
    </div>
  );
}
