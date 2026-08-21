import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthenticatedUser, LoginResponse, Permission } from "@estoque/shared";
import { api, tokenStore, apiFetch } from "./apiClient";

interface AuthContextValue {
  user: AuthenticatedUser | null;
  loading: boolean;
  login: (email: string, password: string, tenantSlug?: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
