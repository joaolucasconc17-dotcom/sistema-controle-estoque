/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL completa do backend em producao (ex.: https://estoque-api.onrender.com/api). Vazio = usa "/api" relativo (dev com proxy do Vite). */
  readonly VITE_API_BASE_URL?: string;
  /** "true" ativa o modo demonstracao: dados fixos no bundle, sem backend e sem login. Usado so no build publicado em hospedagem estatica. */
  readonly VITE_DEMO_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
