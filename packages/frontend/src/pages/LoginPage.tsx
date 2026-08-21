import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/apiClient";

export function LoginPage() {
  const { user, login, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [tenantOptions, setTenantOptions] = useState<{ slug: string; name: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password, tenantSlug || undefined);
    } catch (err) {
      if (err instanceof ApiError && err.details && typeof err.details === "object" && "tenants" in err.details) {
        setTenantOptions((err.details as { tenants: { slug: string; name: string }[] }).tenants);
        setError("Este e-mail existe em mais de uma empresa. Escolha qual voce quer acessar.");
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Nao foi possivel conectar ao servidor.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="h-8 w-8 rounded-md bg-brand-500" />
          <span className="text-lg font-semibold">Estoque</span>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label className="label" htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div>
            <label className="label" htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {tenantOptions && (
            <div>
              <label className="label" htmlFor="tenant">Empresa</label>
              <select id="tenant" className="input" value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)}>
                <option value="">Selecione...</option>
                {tenantOptions.map((t) => (
                  <option key={t.slug} value={t.slug}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
