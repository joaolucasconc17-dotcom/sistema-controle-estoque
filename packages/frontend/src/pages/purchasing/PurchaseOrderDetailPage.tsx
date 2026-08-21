import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../../lib/apiClient";
import { formatMoney, formatQuantity } from "../../lib/format";

interface OrderItem {
  id: string;
  productId: string;
  quantity: string;
  unitCost: string;
  receivedQuantity: string;
  product: { sku: string; name: string };
}
interface OrderDetail {
  id: string;
  status: string;
  supplier: { legalName: string };
  items: OrderItem[];
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  PENDING_APPROVAL: "Aguardando aprovacao",
  APPROVED: "Aprovado",
  PARTIALLY_RECEIVED: "Recebido parcial",
  RECEIVED: "Recebido",
  CANCELLED: "Cancelado",
};

export function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [batchCodes, setBatchCodes] = useState<Record<string, string>>({});

  const orderQuery = useQuery({
    queryKey: ["purchase-order", id],
    queryFn: () => api.get<OrderDetail>(`/purchasing/orders/${id}`),
    enabled: !!id,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["purchase-order", id] });
    queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
    queryClient.invalidateQueries({ queryKey: ["balances"] });
  }

  const transitionMutation = useMutation({
    mutationFn: (action: string) => api.post(`/purchasing/orders/${id}/${action}`),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof ApiError ? err.message : "Erro na operacao"),
  });

  const receiveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post("/purchasing/receipts", data),
    onSuccess: () => {
      invalidate();
      setReceiveQty({});
      setBatchCodes({});
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Erro ao receber"),
  });

  function handleReceive() {
    setError(null);
    const items = Object.entries(receiveQty)
      .filter(([, qty]) => qty && Number(qty) > 0)
      .map(([itemId, qty]) => ({
        purchaseOrderItemId: itemId,
        receivedQuantity: qty,
        ...(batchCodes[itemId] ? { batchCode: batchCodes[itemId] } : {}),
      }));
    if (items.length === 0) {
      setError("Informe a quantidade recebida de ao menos um item.");
      return;
    }
    receiveMutation.mutate({ idempotencyKey: crypto.randomUUID(), purchaseOrderId: id, items });
  }

  const order = orderQuery.data;
  if (!order) return <p className="text-slate-400">Carregando...</p>;

  const canReceive = order.status === "APPROVED" || order.status === "PARTIALLY_RECEIVED";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/purchasing" className="text-sm text-slate-400 hover:text-slate-200">&larr; Compras</Link>
        <h1 className="text-xl font-semibold">Pedido — {order.supplier.legalName}</h1>
        <span className="badge bg-slate-700 text-slate-300">{STATUS_LABELS[order.status] ?? order.status}</span>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {order.status === "DRAFT" && (
          <button className="btn-primary" onClick={() => transitionMutation.mutate("submit")}>
            Enviar para aprovacao
          </button>
        )}
        {order.status === "PENDING_APPROVAL" && (
          <button className="btn-primary" onClick={() => transitionMutation.mutate("approve")}>
            Aprovar
          </button>
        )}
        {order.status !== "RECEIVED" && order.status !== "CANCELLED" && (
          <button className="btn-danger" onClick={() => transitionMutation.mutate("cancel")}>
            Cancelar pedido
          </button>
        )}
      </div>

      <div className="card">
        <h2 className="mb-4 text-sm font-semibold text-slate-300">Itens</h2>
        <table className="table-base">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Produto</th>
              <th>Pedido</th>
              <th>Recebido</th>
              <th>Pendente</th>
              <th>Custo unit.</th>
              {canReceive && <th>Receber agora</th>}
              {canReceive && <th>Lote (se exigir)</th>}
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => {
              const pending = Number(item.quantity) - Number(item.receivedQuantity);
              return (
                <tr key={item.id}>
                  <td className="font-mono text-xs">{item.product.sku}</td>
                  <td>{item.product.name}</td>
                  <td>{formatQuantity(item.quantity)}</td>
                  <td>{formatQuantity(item.receivedQuantity)}</td>
                  <td>{formatQuantity(pending)}</td>
                  <td>{formatMoney(item.unitCost)}</td>
                  {canReceive && (
                    <td>
                      <input
                        className="input w-28"
                        type="number"
                        step="0.0001"
                        max={pending}
                        disabled={pending <= 0}
                        value={receiveQty[item.id] ?? ""}
                        onChange={(e) => setReceiveQty((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      />
                    </td>
                  )}
                  {canReceive && (
                    <td>
                      <input
                        className="input w-32"
                        placeholder="cod. lote"
                        disabled={pending <= 0}
                        value={batchCodes[item.id] ?? ""}
                        onChange={(e) => setBatchCodes((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        {canReceive && (
          <button className="btn-primary mt-4" onClick={handleReceive} disabled={receiveMutation.isPending}>
            {receiveMutation.isPending ? "Recebendo..." : "Registrar recebimento"}
          </button>
        )}
      </div>
    </div>
  );
}
