import type { ApiErrorBody } from "@estoque/shared";

const ACCESS_TOKEN_KEY = "estoque.accessToken";
const REFRESH_TOKEN_KEY = "estoque.refreshToken";

/**
 * Em dev, o Vite faz proxy de "/api" para o backend local (vite.config.ts),
 * entao um caminho relativo basta. Em producao — especialmente hospedagem
 * estatica pura como GitHub Pages, que nao tem como fazer proxy nenhum —
 * o backend mora em outro dominio, entao a URL completa precisa vir de
 * VITE_API_BASE_URL (definida no build). Sem essa variavel, o app ainda
 * sobe e mostra a tela de login, mas toda chamada de API falha — e
 * exatamente o caso de uma instancia so-frontend sem backend publicado.
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const tokenStore = {
  getAccess: () => localStorage.getItem(ACCESS_TOKEN_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_TOKEN_KEY),
  set: (accessToken: string, refreshToken: string) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  },
  clear: () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

/**
 * Evita duas chamadas de refresh em paralelo quando varias requisicoes
 * batem em 401 ao mesmo tempo (ex.: dashboard disparando 5 fetches juntos
 * com o access token vencido) — todas esperam a MESMA promise de refresh.
 */
let refreshInFlight: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = tokenStore.getRefresh();
    if (!refreshToken) throw new ApiError("UNAUTHORIZED", "Sem sessao", 401);

    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      tokenStore.clear();
      throw new ApiError("UNAUTHORIZED", "Sessao expirada", 401);
    }
    const data = await res.json();
    tokenStore.set(data.accessToken, data.refreshToken);
    return data.accessToken as string;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  skipAuthRetry?: boolean;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const accessToken = tokenStore.getAccess();

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && !options.skipAuthRetry && tokenStore.getRefresh()) {
    try {
      await refreshAccessToken();
      return apiFetch<T>(path, { ...options, skipAuthRetry: true });
    } catch {
      tokenStore.clear();
      window.location.href = "/login";
      throw new ApiError("UNAUTHORIZED", "Sessao expirada", 401);
    }
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const body = json as ApiErrorBody | null;
    throw new ApiError(
      body?.error?.code ?? "INTERNAL_ERROR",
      body?.error?.message ?? "Erro inesperado",
      res.status,
      body?.error?.details,
    );
  }

  return json as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "POST", body: body ?? {} }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PATCH", body: body ?? {} }),
  put: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PUT", body: body ?? {} }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
