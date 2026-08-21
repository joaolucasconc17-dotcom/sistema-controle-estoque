import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { CursorPage } from "@estoque/shared";
import { api, ApiError } from "../../lib/apiClient";
import { formatMoney } from "../../lib/format";

interface Product {
  id: string;
  sku: string;
  name: string;
  active: boolean;
  costPrice: string | null;
  salePrice: string | null;
  trackingMode: string;
  unitOfMeasure: { code: string };
  category: { name: string } | null;
}

interface UnitOfMeasure {
  id: string;
  code: string;
  name: string;
}
interface Category {
  id: string;
  name: string;
}

export function ProductsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const productsQuery = useQuery({
    queryKey: ["products", search],
    queryFn: () => api.get<CursorPage<Product>>(`/catalog/products?limit=50${search ? `&search=${encodeURIComponent(search)}` : ""}`),
  });

  const uomsQuery = useQuery({
    queryKey: ["units-of-measure"],
    queryFn: () => api.get<UnitOfMeasure[]>("/catalog/units-of-measure"),
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/catalog/categories"),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post("/catalog/products", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setShowForm(false);
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : "Erro ao criar produto"),
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const form = new FormData(e.currentTarget);
    createMutation.mutate({
      sku: form.get("sku"),
      name: form.get("name"),
      unitOfMeasureId: form.get("unitOfMeasureId"),
      categoryId: form.get("categoryId") || undefined,
      trackingMode: form.get("trackingMode"),
      costPrice: form.get("costPrice") || undefined,
      salePrice: form.get("salePrice") || undefined,
      minStock: form.get("minStock") || undefined,
      barcodes: [],
      active: true,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Produtos</h1>
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancelar" : "Novo produto"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">SKU</label>
              <input name="sku" required className="input" />
            </div>
            <div>
              <label className="label">Nome</label>
              <input name="name" required className="input" />
            </div>
            <div>
              <label className="label">Unidade de medida</label>
              <select name="unitOfMeasureId" required className="input">
                <option value="">Selecione...</option>
                {uomsQuery.data?.map((u) => (
                  <option key={u.id} value={u.id}>{u.code} — {u.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Categoria</label>
              <select name="categoryId" className="input">
                <option value="">Sem categoria</option>
                {categoriesQuery.data?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Rastreio</label>
              <select name="trackingMode" className="input" defaultValue="NONE">
                <option value="NONE">Nenhum</option>
                <option value="BATCH">Por lote</option>
                <option value="SERIAL">Por numero de serie</option>
              </select>
            </div>
            <div>
              <label className="label">Estoque minimo</label>
              <input name="minStock" type="number" step="0.0001" className="input" />
            </div>
            <div>
              <label className="label">Custo</label>
              <input name="costPrice" type="number" step="0.01" className="input" />
            </div>
            <div>
              <label className="label">Preco de venda</label>
              <input name="salePrice" type="number" step="0.01" className="input" />
            </div>
          </div>
          {formError && <p className="text-sm text-red-400">{formError}</p>}
          <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Salvando..." : "Salvar produto"}
          </button>
        </form>
      )}

      <div className="card">
        <input
          className="input mb-4 max-w-sm"
          placeholder="Buscar por nome ou SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <table className="table-base">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Nome</th>
              <th>Categoria</th>
              <th>UM</th>
              <th>Custo</th>
              <th>Venda</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {productsQuery.isLoading && (
              <tr><td colSpan={8} className="py-6 text-center text-slate-500">Carregando...</td></tr>
            )}
            {productsQuery.data?.items.length === 0 && (
              <tr><td colSpan={8} className="py-6 text-center text-slate-500">Nenhum produto encontrado</td></tr>
            )}
            {productsQuery.data?.items.map((p) => (
              <tr key={p.id}>
                <td className="font-mono text-xs">{p.sku}</td>
                <td>{p.name}</td>
                <td>{p.category?.name ?? "-"}</td>
                <td>{p.unitOfMeasure.code}</td>
                <td>{formatMoney(p.costPrice)}</td>
                <td>{formatMoney(p.salePrice)}</td>
                <td>
                  <span className={`badge ${p.active ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-700 text-slate-400"}`}>
                    {p.active ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td>
                  <Link to={`/inventory/kardex/${p.id}`} className="text-brand-400 hover:underline text-xs">
                    Kardex
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
