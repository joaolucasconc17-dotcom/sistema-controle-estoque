import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { IS_DEMO_MODE } from "../lib/demo/demoFlag";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/products", label: "Produtos" },
  { to: "/inventory", label: "Movimentacoes" },
  { to: "/purchasing", label: "Compras" },
  { to: "/suppliers", label: "Fornecedores" },
  { to: "/organization", label: "Filiais e Depositos" },
  { to: "/reports", label: "Relatorios" },
];

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="flex min-h-screen">
        <aside className="hidden w-60 shrink-0 border-r border-slate-800 bg-slate-900/40 md:block">
          <div className="flex h-16 items-center gap-2 border-b border-slate-800 px-5">
            <div className="h-7 w-7 rounded-md bg-brand-500" />
            <span className="font-semibold tracking-tight">Estoque</span>
          </div>
          <nav className="flex flex-col gap-1 p-3">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? "bg-brand-500/15 text-brand-400" : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <div className="flex flex-1 flex-col">
          <header className="flex h-16 items-center justify-between border-b border-slate-800 px-4 md:px-6">
            <div className="text-sm text-slate-400">
              {user?.tenantSlug && <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300">{user.tenantSlug}</span>}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-medium text-slate-100">{user?.name}</div>
                <div className="text-xs text-slate-500">{user?.roles.join(", ")}</div>
              </div>
              {!IS_DEMO_MODE && (
                <button className="btn-secondary" onClick={() => void logout()}>
                  Sair
                </button>
              )}
            </div>
          </header>

          {IS_DEMO_MODE && (
            <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-300 md:px-6">
              Versao de demonstracao — dados de exemplo, somente leitura. Sem backend conectado.
            </div>
          )}

          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
