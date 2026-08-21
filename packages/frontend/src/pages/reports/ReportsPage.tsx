import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/apiClient";
import { formatDate, formatMoney, formatQuantity } from "../../lib/format";

type ReportTab = "valuation" | "abc" | "low-stock" | "expiring" | "turnover" | "stale";

const TABS: { id: ReportTab; label: string }[] = [
  { id: "valuation", label: "Valorizacao" },
  { id: "abc", label: "Curva ABC" },
  { id: "low-stock", label: "Ruptura / minimo" },
  { id: "expiring", label: "Vencimentos" },
  { id: "turnover", label: "Giro" },
  { id: "stale", label: "Parados" },
];

const ENDPOINTS: Record<ReportTab, string> = {
  valuation: "/reports/valuation",
  abc: "/reports/abc-curve",
  "low-stock": "/reports/low-stock",
  expiring: "/reports/expiring-batches?days=60",
  turnover: "/reports/turnover?days=30",
  stale: "/reports/stale-products?days=90",
};

export function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>("valuation");

  const reportQuery = useQuery({
    queryKey: ["report", tab],
    queryFn: () => api.get<{ items: Record<string, string>[]; totalValue?: string }>(ENDPOINTS[tab]),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Relatorios</h1>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "btn-primary" : "btn-secondary"} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="card">
        {reportQuery.isLoading && <p className="text-slate-400">Carregando...</p>}

        {tab === "valuation" && reportQuery.data?.totalValue && (
          <p className="mb-4 text-lg">
            Valor total em estoque:{" "}
            <span className="font-semibold text-brand-400">{formatMoney(reportQuery.data.totalValue)}</span>
          </p>
        )}

        {reportQuery.data && <ReportTable tab={tab} items={reportQuery.data.items} />}
      </div>
    </div>
  );
}

function ReportTable({ tab, items }: { tab: ReportTab; items: Record<string, string>[] }) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-slate-500">Nada a exibir neste relatorio.</p>;
  }

  if (tab === "expiring") {
    return (
      <table className="table-base">
        <thead>
          <tr><th>Lote</th><th>SKU</th><th>Produto</th><th>Validade</th><th>Quantidade</th></tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.batchId}>
              <td className="font-mono text-xs">{i.code}</td>
              <td className="font-mono text-xs">{i.productSku}</td>
              <td>{i.productName}</td>
              <td>{formatDate(i.expirationDate)}</td>
              <td>{formatQuantity(i.quantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (tab === "low-stock") {
    return (
      <table className="table-base">
        <thead><tr><th>SKU</th><th>Produto</th><th>Saldo</th><th>Minimo</th><th>Situacao</th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.productId}>
              <td className="font-mono text-xs">{i.sku}</td>
              <td>{i.name}</td>
              <td>{formatQuantity(i.quantity)}</td>
              <td>{formatQuantity(i.minStock)}</td>
              <td>
                <span className={`badge ${i.status === "RUPTURA" ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"}`}>
                  {i.status === "RUPTURA" ? "Ruptura" : "Abaixo do minimo"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (tab === "turnover") {
    return (
      <table className="table-base">
        <thead><tr><th>SKU</th><th>Produto</th><th>Vendido</th><th>Saldo atual</th><th>Giro</th><th>Cobertura (dias)</th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.productId}>
              <td className="font-mono text-xs">{i.sku}</td>
              <td>{i.name}</td>
              <td>{formatQuantity(i.soldQuantity)}</td>
              <td>{formatQuantity(i.currentQuantity)}</td>
              <td>{i.turnoverRate ?? "-"}</td>
              <td>{i.daysOfCoverage ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (tab === "abc") {
    return (
      <table className="table-base">
        <thead><tr><th>Classe</th><th>SKU</th><th>Produto</th><th>Quantidade</th><th>Valor</th><th>% acumulado</th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.productId}>
              <td>
                <span className={`badge ${i.classification === "A" ? "bg-emerald-500/15 text-emerald-400" : i.classification === "B" ? "bg-amber-500/15 text-amber-400" : "bg-slate-700 text-slate-400"}`}>
                  {i.classification}
                </span>
              </td>
              <td className="font-mono text-xs">{i.sku}</td>
              <td>{i.name}</td>
              <td>{formatQuantity(i.quantity)}</td>
              <td>{formatMoney(i.value)}</td>
              <td>{i.cumulativePct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  // valuation e stale compartilham o mesmo formato
  return (
    <table className="table-base">
      <thead><tr><th>SKU</th><th>Produto</th><th>Quantidade</th><th>Valor</th></tr></thead>
      <tbody>
        {items.map((i) => (
          <tr key={i.productId}>
            <td className="font-mono text-xs">{i.sku}</td>
            <td>{i.name}</td>
            <td>{formatQuantity(i.quantity)}</td>
            <td>{formatMoney(i.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
