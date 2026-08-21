import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/apiClient";
import { formatMoney, formatQuantity } from "../lib/format";
import { StatCard } from "../components/StatCard";

interface DashboardData {
  totalStockValue: string;
  activeProductCount: number;
  lowStockCount: number;
  expiringBatchCount: number;
  topValueProducts: { productId: string; sku: string; name: string; quantity: string; value: string }[];
}

export function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["reports", "dashboard"],
    queryFn: () => api.get<DashboardData>("/reports/dashboard"),
  });

  if (isLoading) return <p className="text-slate-400">Carregando...</p>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Visao geral</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Valor em estoque" value={formatMoney(data.totalStockValue)} />
        <StatCard label="Produtos ativos" value={String(data.activeProductCount)} />
        <StatCard
          label="Ruptura / abaixo do minimo"
          value={String(data.lowStockCount)}
          tone={data.lowStockCount > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Lotes vencendo (30 dias)"
          value={String(data.expiringBatchCount)}
          tone={data.expiringBatchCount > 0 ? "danger" : "default"}
        />
      </div>

      <div className="card">
        <h2 className="mb-4 text-sm font-semibold text-slate-300">Top 5 produtos por valor em estoque</h2>
        <table className="table-base">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Produto</th>
              <th>Quantidade</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {data.topValueProducts.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-slate-500">Sem movimentacao ainda</td>
              </tr>
            )}
            {data.topValueProducts.map((p) => (
              <tr key={p.productId}>
                <td className="font-mono text-xs">{p.sku}</td>
                <td>{p.name}</td>
                <td>{formatQuantity(p.quantity)}</td>
                <td>{formatMoney(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
