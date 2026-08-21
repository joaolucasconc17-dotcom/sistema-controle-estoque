import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthenticatedUser, LoginResponse, Permission } from "@estoque/shared";
// Importado do subpath "/enums" e nao do indice do pacote: o indice
// reexporta os contratos Zod, o que arrastaria o Zod inteiro (~57KB) para
// dentro do bundle do frontend so para ler uma lista de permissoes.
import { PERMISSIONS } from "@estoque/shared/enums";
import { api, tokenStore, apiFetch } from "./apiClient";
import { IS_DEMO_MODE } from "./demo/demoFlag.js";

interface AuthContextValue {
  user: AuthenticatedUser | null;
  loading: boolean;
  login: (email: string, password: string, tenantSlug?: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Usuario ficticio do modo demonstracao — nao existe no backend nem tem
 * token. Declarado inline (em vez de importado de demoData) para nao
 * arrastar o modulo de dados de demo para dentro do bundle principal: ele
 * so deve ser carregado sob demanda, via import() dinamico no apiClient.
 */
const DEMO_AUTH_USER: AuthenticatedUser = {
  id: "demo-user",
  name: "Visitante (demonstracao)",
  email: "demo@exemplo.com",
  tenantId: "demo-tenant",
  tenantSlug: "demonstracao",
  roles: ["ADMIN"],
  permissions: [...PERMISSIONS],
};

export function AuthProvider({ children }: { children: ReactNode }) {
  // No modo demonstracao ja entra "logado": nao ha backend para autenticar
  // contra, e o objetivo dessa versao publica e deixar navegar o sistema
  // sem barreira. Com a flag desligada (default), nada disso acontece e o
  // login real continua obrigatorio.
  const [user, setUser] = useState<AuthenticatedUser | null>(IS_DEMO_MODE ? DEMO_AUTH_USER : null);
  const [loading, setLoading] = useState(!IS_DEMO_MODE);

  useEffect(() => {
    if (IS_DEMO_MODE) return;
    // Ao recarregar a pagina, so temos os tokens salvos — reconstrói quem
    // e o usuario chamando /auth/me (o access token guarda tudo que
    // precisamos, mas nao confiamos em decodificar o JWT no cliente).
    async function restore() {
      if (!tokenStore.getAccess()) {
        setLoading(false);
        return;
      }
      try {
        const res = await apiFetch<{ auth: AuthenticatedUser & { permissions: Permission[] } }>("/auth/me");
        setUser(res.auth);
      } catch {
        tokenStore.clear();
      } finally {
        setLoading(false);
      }
    }
    void restore();
  }, []);

  const login = useCallback(async (email: string, password: string, tenantSlug?: string) => {
    const res = await api.post<LoginResponse>("/auth/login", { email, password, tenantSlug });
    tokenStore.set(res.accessToken, res.refreshToken);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    // No modo demonstracao nao ha sessao de verdade para encerrar; sair
    // apenas devolveria uma tela de login inutil (sem backend para
    // autenticar de volta).
    if (IS_DEMO_MODE) return;

    const refreshToken = tokenStore.getRefresh();
    tokenStore.clear();
    setUser(null);
    if (refreshToken) {
      await api.post("/auth/logout", { refreshToken }).catch(() => undefined);
    }
  }, []);

  const hasPermission = useCallback((permission: Permission) => user?.permissions.includes(permission) ?? false, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPermission }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}
