import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { CursorPage } from "@estoque/shared";
import { api, ApiError } from "../../lib/apiClient";
import { formatDate } from "../../lib/format";

interface PurchaseOrder {
  id: string;
  status: string;
  expectedDate: string | null;
  createdAt: string;
  supplier: { legalName: string };
  warehouse: { name: string };
}
interface Supplier { id: string; legalName: string }
interface Warehouse { id: string; name: string; code: string }
interface Product { id: string; sku: string; name: string }

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-700 text-slate-300",
  PENDING_APPROVAL: "bg-amber-500/15 text-amber-400",
  APPROVED: "bg-brand-500/15 text-brand-400",
  PARTIALLY_RECEIVED: "bg-indigo-500/15 text-indigo-400",
  RECEIVED: "bg-emerald-500/15 text-emerald-400",
  CANCELLED: "bg-red-500/15 text-red-400",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  PENDING_APPROVAL: "Aguardando aprovacao",
  APPROVED: "Aprovado",
  PARTIALLY_RECEIVED: "Recebido parcial",
  RECEIVED: "Recebido",
  CANCELLED: "Cancelado",
};

export function PurchasingPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<{ productId: string; quantity: string; unitCost: string }[]>([
    { productId: "", quantity: "", unitCost: "" },
  ]);

  const ordersQuery = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: () => api.get<CursorPage<PurchaseOrder>>("/purchasing/orders?limit=50"),
  });
  const suppliersQuery = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => api.get<CursorPage<Supplier>>("/catalog/suppliers?limit=100"),
  });
  const warehousesQuery = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => api.get<CursorPage<Warehouse>>("/org/warehouses?limit=100"),
  });
  const productsQuery = useQuery({
    queryKey: ["products", "for-purchase"],
    queryFn: () => api.get<CursorPage<Product>>("/catalog/products?limit=200"),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post("/purchasing/orders", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      setShowForm(false);
      setItems([{ productId: "", quantity: "", unitCost: "" }]);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Erro ao criar pedido"),
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const validItems = items.filter((i) => i.productId && i.quantity && i.unitCost);
    if (validItems.length === 0) {
      setError("Adicione ao menos um item completo.");
      return;
    }
    createMutation.mutate({
      supplierId: form.get("supplierId"),
      warehouseId: form.get("warehouseId"),
      items: validItems,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Pedidos de compra</h1>
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancelar" : "Novo pedido"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Fornecedor</label>
              <select name="supplierId" required className="input">
                <option value="">Selecione...</option>
                {suppliersQuery.data?.items.map((s) => (
                  <option key={s.id} value={s.id}>{s.legalName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Deposito de entrada</label>
              <select name="warehouseId" required className="input">
                <option value="">Selecione...</option>
                {warehousesQuery.data?.items.map((w) => (
                  <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="label">Itens</label>
            {items.map((item, idx) => (
              <div key={idx} className="flex gap-2">
                <select
                  className="input"
                  value={item.productId}
                  onChange={(e) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, productId: e.target.value } : it)))}
                >
                  <option value="">Produto...</option>
                  {productsQuery.data?.items.map((p) => (
                    <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
                  ))}
                </select>
                <input
                  className="input w-32"
                  type="number"
                  step="0.0001"
                  placeholder="Qtd"
                  value={item.quantity}
                  onChange={(e) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, quantity: e.target.value } : it)))}
                />
                <input
                  className="input w-32"
                  type="number"
                  step="0.0001"
                  placeholder="Custo"
                  value={item.unitCost}
                  onChange={(e) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, unitCost: e.target.value } : it)))}
                />
                <button
                  type="button"
                  className="btn-secondary shrink-0"
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                  disabled={items.length === 1}
                >
                  -
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setItems((prev) => [...prev, { productId: "", quantity: "", unitCost: "" }])}
            >
              + Adicionar item
            </button>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Criando..." : "Criar pedido"}
          </button>
        </form>
      )}

      <div className="card">
        <table className="table-base">
          <thead>
            <tr>
              <th>Fornecedor</th>
              <th>Deposito</th>
              <th>Status</th>
              <th>Criado em</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ordersQuery.data?.items.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-slate-500">Nenhum pedido de compra</td></tr>
            )}
            {ordersQuery.data?.items.map((o) => (
              <tr key={o.id}>
                <td>{o.supplier.legalName}</td>
                <td>{o.warehouse.name}</td>
                <td>
                  <span className={`badge ${STATUS_STYLES[o.status] ?? "bg-slate-700 text-slate-300"}`}>
                    {STATUS_LABELS[o.status] ?? o.status}
                  </span>
                </td>
                <td className="text-xs">{formatDate(o.createdAt)}</td>
                <td>
                  <Link to={`/purchasing/${o.id}`} className="text-brand-400 hover:underline text-xs">Abrir</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
