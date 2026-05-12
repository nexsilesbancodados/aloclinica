// Optimized Vite configuration for AloClinica
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["favicon.ico", "pwa-192x192.png", "pwa-512x512.png"],
      devOptions: { enabled: false },
      workbox: {
        navigateFallback: null,
        globPatterns: ["**/*.{ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-stylesheets",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|avif)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "images-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/oaixgmuocuwhsabidpei\.supabase\.co\/rest\/v1\/(medical_records|prescriptions|profiles|appointments).*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "supabase-medical-data",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/oaixgmuocuwhsabidpei\.supabase\.co\/rest\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 5 },
              networkTimeoutSeconds: 5,
            },
          },
          {
            urlPattern: /^https:\/\/oaixgmuocuwhsabidpei\.supabase\.co\/storage\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "supabase-storage",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: "AloClinica - Telemedicina",
        short_name: "AloClinica",
        description: "Plataforma completa de telemedicina com videochamadas, agendamento e receitas digitais",
        theme_color: "#1a6fc4",
        background_color: "#f8fafc",
        display: "standalone",
        display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
        orientation: "portrait-primary",
        start_url: "/?source=pwa",
        scope: "/",
        id: "/?source=pwa",
        categories: ["medical", "health"],
        lang: "pt-BR",
        dir: "ltr",
        shortcuts: [
          {
            name: "Agendar Consulta",
            short_name: "Agendar",
            description: "Agende uma consulta médica rapidamente",
            url: "/dashboard/schedule?role=patient&source=pwa-shortcut",
            icons: [{ src: "https://cvbgrjauqjawrsyknhyj.supabase.co/storage/v1/object/public/files/uploads/0XILPRqqUbSOh99ow53X5OBDOCC3/1776903297218-6gd6d-image.png", sizes: "192x192" }],
          },
          {
            name: "Plantão 24h",
            short_name: "Urgência",
            description: "Atendimento de urgência imediato",
            url: "/dashboard/urgent-care?role=patient&source=pwa-shortcut",
            icons: [{ src: "https://cvbgrjauqjawrsyknhyj.supabase.co/storage/v1/object/public/files/uploads/0XILPRqqUbSOh99ow53X5OBDOCC3/1776903297218-6gd6d-image.png", sizes: "192x192" }],
          },
          {
            name: "Cartão Saúde",
            short_name: "Cartão",
            description: "Acesse seu cartão de saúde digital",
            url: "/dashboard/patient/health-card?role=patient&source=pwa-shortcut",
            icons: [{ src: "https://cvbgrjauqjawrsyknhyj.supabase.co/storage/v1/object/public/files/uploads/0XILPRqqUbSOh99ow53X5OBDOCC3/1776903297218-6gd6d-image.png", sizes: "192x192" }],
          },
          {
            name: "Minhas Consultas",
            short_name: "Consultas",
            description: "Visualize suas consultas agendadas",
            url: "/dashboard/appointments?role=patient&source=pwa-shortcut",
            icons: [{ src: "https://cvbgrjauqjawrsyknhyj.supabase.co/storage/v1/object/public/files/uploads/0XILPRqqUbSOh99ow53X5OBDOCC3/1776903297218-6gd6d-image.png", sizes: "192x192" }],
          },
        ],
        prefer_related_applications: false,
        icons: [
          { src: "https://cvbgrjauqjawrsyknhyj.supabase.co/storage/v1/object/public/files/uploads/0XILPRqqUbSOh99ow53X5OBDOCC3/1776903297218-6gd6d-image.png", sizes: "192x192", type: "image/png" },
          { src: "https://cvbgrjauqjawrsyknhyj.supabase.co/storage/v1/object/public/files/uploads/0XILPRqqUbSOh99ow53X5OBDOCC3/1776903297218-6gd6d-image.png", sizes: "512x512", type: "image/png" },
          { src: "https://cvbgrjauqjawrsyknhyj.supabase.co/storage/v1/object/public/files/uploads/0XILPRqqUbSOh99ow53X5OBDOCC3/1776903297218-6gd6d-image.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "https://cvbgrjauqjawrsyknhyj.supabase.co/storage/v1/object/public/files/uploads/0XILPRqqUbSOh99ow53X5OBDOCC3/1776903297218-6gd6d-image.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        screenshots: [
          {
            src: "https://cvbgrjauqjawrsyknhyj.supabase.co/storage/v1/object/public/files/uploads/0XILPRqqUbSOh99ow53X5OBDOCC3/1776903297218-6gd6d-image.png",
            sizes: "512x512",
            type: "image/png",
            form_factor: "narrow",
            label: "AloClínica Telemedicina",
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "@tiptap/react"],
  },
  build: {
    target: "es2020",
    cssTarget: "safari14",
    chunkSizeWarningLimit: 600,
    minify: "esbuild",
    sourcemap: false,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // Agrupa libs em chunks por uso, melhora cache HTTP entre deploys.
        // Páginas/componentes do app continuam sendo splittados via React.lazy.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          // Libs grandes ficam em chunks separados pra não invalidar tudo
          if (id.includes("recharts")) return "vendor-charts";
          if (id.includes("@tiptap") || id.includes("prosemirror")) return "vendor-editor";
          if (id.includes("jspdf") || id.includes("html2canvas")) return "vendor-pdf";
          if (id.includes("framer-motion")) return "vendor-motion";
          if (id.includes("@supabase") || id.includes("@tanstack/react-query")) return "vendor-data";
          if (id.includes("@radix-ui")) return "vendor-ui-radix";
          if (id.includes("lucide-react") || id.includes("@phosphor-icons")) return "vendor-icons";
          if (id.includes("react-router")) return "vendor-router";
          if (id.includes("date-fns")) return "vendor-dates";
          if (id.includes("react-dom") || id.includes("/react/")) return "vendor-react";
          return "vendor";
        },
      },
    },
  },
}));
