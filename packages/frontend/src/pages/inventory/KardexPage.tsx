import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type { CursorPage } from "@estoque/shared";
import { api } from "../../lib/apiClient";
import { formatDateTime, formatMoney, formatQuantity } from "../../lib/format";

interface Movement {
  id: string;
  type: string;
  quantity: string;
  unitCost: string;
  totalCost: string;
  balanceAfter: string;
  avgCostAfter: string;
  reference: string | null;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  ENTRADA: "Entrada",
  SAIDA: "Saida",
  TRANSFERENCIA_SAIDA: "Transf. (saida)",
  TRANSFERENCIA_ENTRADA: "Transf. (entrada)",
  AJUSTE_POSITIVO: "Ajuste +",
  AJUSTE_NEGATIVO: "Ajuste -",
  ESTORNO: "Estorno",
};

const INCREASE_TYPES = new Set(["ENTRADA", "TRANSFERENCIA_ENTRADA", "AJUSTE_POSITIVO"]);

export function KardexPage() {
  const { productId } = useParams<{ productId: string }>();

  const kardexQuery = useQuery({
    queryKey: ["kardex", productId],
    queryFn: () => api.get<CursorPage<Movement>>(`/inventory/kardex/${productId}?limit=100`),
    enabled: !!productId,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/products" className="text-sm text-slate-400 hover:text-slate-200">&larr; Produtos</Link>
        <h1 className="text-xl font-semibold">Kardex</h1>
      </div>

      <div className="card">
        <table className="table-base">
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th>Quantidade</th>
              <th>Custo unit.</th>
              <th>Saldo apos</th>
              <th>Custo medio apos</th>
              <th>Referencia</th>
            </tr>
          </thead>
          <tbody>
            {kardexQuery.isLoading && (
              <tr><td colSpan={7} className="py-6 text-center text-slate-500">Carregando...</td></tr>
            )}
            {kardexQuery.data?.items.length === 0 && (
              <tr><td colSpan={7} className="py-6 text-center text-slate-500">Nenhuma movimentacao ainda</td></tr>
            )}
            {kardexQuery.data?.items.map((m) => {
              const isIncrease = INCREASE_TYPES.has(m.type);
              return (
                <tr key={m.id}>
                  <td className="text-xs">{formatDateTime(m.createdAt)}</td>
                  <td>
                    <span className={`badge ${isIncrease ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                      {TYPE_LABELS[m.type] ?? m.type}
                    </span>
                  </td>
                  <td>{isIncrease ? "+" : "-"}{formatQuantity(m.quantity)}</td>
                  <td>{formatMoney(m.unitCost)}</td>
                  <td>{formatQuantity(m.balanceAfter)}</td>
                  <td>{formatMoney(m.avgCostAfter)}</td>
                  <td className="text-xs text-slate-400">{m.reference ?? "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
