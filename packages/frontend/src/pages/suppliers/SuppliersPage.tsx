import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CursorPage } from "@estoque/shared";
import { api, ApiError } from "../../lib/apiClient";

interface Supplier {
  id: string;
  legalName: string;
  tradeName: string | null;
  document: string;
  email: string | null;
  active: boolean;
}

export function SuppliersPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const suppliersQuery = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => api.get<CursorPage<Supplier>>("/catalog/suppliers?limit=100"),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post("/catalog/suppliers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setShowForm(false);
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : "Erro ao criar fornecedor"),
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const form = new FormData(e.currentTarget);
    createMutation.mutate({
      legalName: form.get("legalName"),
      tradeName: form.get("tradeName") || undefined,
      document: form.get("document"),
      email: form.get("email") || undefined,
      phone: form.get("phone") || undefined,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Fornecedores</h1>
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancelar" : "Novo fornecedor"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Razao social</label>
              <input name="legalName" required className="input" />
            </div>
            <div>
              <label className="label">Nome fantasia</label>
              <input name="tradeName" className="input" />
            </div>
            <div>
              <label className="label">CNPJ/CPF</label>
              <input name="document" required className="input" />
            </div>
            <div>
              <label className="label">E-mail</label>
              <input name="email" type="email" className="input" />
            </div>
            <div>
              <label className="label">Telefone</label>
              <input name="phone" className="input" />
            </div>
          </div>
          {formError && <p className="text-sm text-red-400">{formError}</p>}
          <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Salvando..." : "Salvar fornecedor"}
          </button>
        </form>
      )}

      <div className="card">
        <table className="table-base">
          <thead>
            <tr>
              <th>Razao social</th>
              <th>Fantasia</th>
              <th>Documento</th>
              <th>E-mail</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {suppliersQuery.data?.items.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-slate-500">Nenhum fornecedor cadastrado</td></tr>
            )}
            {suppliersQuery.data?.items.map((s) => (
              <tr key={s.id}>
                <td>{s.legalName}</td>
                <td>{s.tradeName ?? "-"}</td>
                <td className="font-mono text-xs">{s.document}</td>
                <td>{s.email ?? "-"}</td>
                <td>
                  <span className={`badge ${s.active ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-700 text-slate-400"}`}>
                    {s.active ? "Ativo" : "Inativo"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
