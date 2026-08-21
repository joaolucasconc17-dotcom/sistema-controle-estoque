import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages serve projetos numa subpasta (usuario.github.io/repo/), nao
// na raiz do dominio — sem isso, os assets buildados apontariam para "/"
// e dariam 404 no Pages. VITE_BASE_PATH so e setado no workflow de deploy
// do Pages; localmente (sem a env var) o comportamento continua "/" como
// sempre foi.
const base = process.env.VITE_BASE_PATH ?? "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Estoque — Controle de Estoque",
        short_name: "Estoque",
        description: "Sistema de controle de estoque multiempresa",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        // Relativo ao `base` (resolvido pelo VitePWA), nao "/" fixo — assim
        // funciona tanto na raiz quanto numa subpasta como a do Pages.
        start_url: ".",
        scope: ".",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
        ],
      },
      workbox: {
        // API nunca fica em cache do service worker — dado de estoque tem
        // que ser sempre fresco. So o "shell" (JS/CSS/HTML) e cacheado para
        // o app abrir instalado mesmo sem rede; a fila de escrita offline
        // (idempotencyKey) e feita em codigo, nao pelo workbox.
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3333",
        changeOrigin: true,
      },
    },
  },
});
