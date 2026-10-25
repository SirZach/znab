import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  plugins: [
    TanStackRouterVite({ routesDirectory: "./src/routes" }),
    react(),
    tailwindcss(),
    // Installable app. The service worker precaches only the built shell; it
    // has no runtime caching, so API calls (money data) always hit the network.
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      manifest: {
        name: "ZNAB",
        short_name: "ZNAB",
        display: "standalone",
        start_url: "/",
        scope: "/",
        theme_color: "#020817",
        background_color: "#020817",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallbackDenylist: [/^\/trpc\//, /^\/health/, /^\/export\//],
        cleanupOutdatedCaches: true,
        // The main bundle is ~1.5MB; the default 2MiB cap would silently drop it.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["znab", ".ts.net"],
    port: 5173,
  },
});
