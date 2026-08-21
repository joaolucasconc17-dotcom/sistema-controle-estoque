/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL completa do backend em producao (ex.: https://estoque-api.onrender.com/api). Vazio = usa "/api" relativo (dev com proxy do Vite). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
