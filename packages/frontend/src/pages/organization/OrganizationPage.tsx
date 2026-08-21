import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CursorPage } from "@estoque/shared";
import { api, ApiError } from "../../lib/apiClient";

interface CompanyUnit { id: string; name: string; code: string; active: boolean }
interface Warehouse { id: string; name: string; code: string; companyUnitId: string }

export function OrganizationPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const unitsQuery = useQuery({
    queryKey: ["company-units"],
    queryFn: () => api.get<CursorPage<CompanyUnit>>("/org/company-units?limit=100"),
  });
  const warehousesQuery = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => api.get<CursorPage<Warehouse>>("/org/warehouses?limit=100"),
  });

  const createUnit = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post("/org/company-units", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company-units"] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Erro ao criar filial"),
  });

  const createWarehouse = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post("/org/warehouses", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["warehouses"] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Erro ao criar deposito"),
  });

  function handleUnitSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    createUnit.mutate({ name: form.get("name"), code: form.get("code") });
    e.currentTarget.reset();
  }

  function handleWarehouseSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    createWarehouse.mutate({
      companyUnitId: form.get("companyUnitId"),
      name: form.get("name"),
      code: form.get("code"),
    });
    e.currentTarget.reset();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Filiais e depositos</h1>
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-slate-300">Filiais</h2>
          <form onSubmit={handleUnitSubmit} className="flex gap-2">
            <input name="name" placeholder="Nome" required className="input" />
            <input name="code" placeholder="Codigo" required className="input w-28" />
            <button type="submit" className="btn-primary shrink-0" disabled={createUnit.isPending}>+</button>
          </form>
          <table className="table-base">
            <thead><tr><th>Codigo</th><th>Nome</th></tr></thead>
            <tbody>
              {unitsQuery.data?.items.map((u) => (
                <tr key={u.id}><td className="font-mono text-xs">{u.code}</td><td>{u.name}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-slate-300">Depositos</h2>
          <form onSubmit={handleWarehouseSubmit} className="space-y-2">
            <select name="companyUnitId" required className="input">
              <option value="">Filial...</option>
              {unitsQuery.data?.items.map((u) => (
                <option key={u.id} value={u.id}>{u.code} — {u.name}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <input name="name" placeholder="Nome" required className="input" />
              <input name="code" placeholder="Codigo" required className="input w-28" />
              <button type="submit" className="btn-primary shrink-0" disabled={createWarehouse.isPending}>+</button>
            </div>
          </form>
          <table className="table-base">
            <thead><tr><th>Codigo</th><th>Nome</th></tr></thead>
            <tbody>
              {warehousesQuery.data?.items.map((w) => (
                <tr key={w.id}><td className="font-mono text-xs">{w.code}</td><td>{w.name}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
