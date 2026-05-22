import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "robots.txt"],
      manifest: {
        name: "Aetheria",
        short_name: "Aetheria",
        description: "Web-based MMORPG — Ragnarok-inspired, fully procedural",
        theme_color: "#22d3ee",
        background_color: "#0f172a",
        display: "fullscreen",
        orientation: "landscape",
        start_url: "/",
        icons: [
          // Use favicon at multiple sizes — Vite generates these from public/favicon.ico
          { src: "/favicon.ico", sizes: "64x64 32x32 24x24 16x16", type: "image/x-icon" },
        ],
      },
      workbox: {
        // Cache static assets aggressively (they're hash-busted).
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff,woff2}"],
        // Skip API/WS traffic — auth tokens + realtime can't be cached.
        navigateFallbackDenylist: [/^\/auth/, /^\/leaderboard/, /^\/health/],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\.(?:js|css|woff2?)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "static-assets",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /\/assets\/.*\.(?:png|jpg|webp|glb|gltf|ogg|mp3)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "game-assets",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: { enabled: false }, // don't run SW in dev — confuses HMR
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/auth": "http://localhost:2567",
      "/leaderboard": "http://localhost:2567",
      "/api": "http://localhost:2567",
    },
  },
  build: {
    // Separate vendor chunks so app updates don't invalidate the (cacheable)
    // Three.js / React / Colyseus payloads.
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          drei: ["@react-three/drei", "@react-three/fiber"],
          colyseus: ["colyseus.js"],
          react: ["react", "react-dom"],
        },
      },
    },
    chunkSizeWarningLimit: 800,
    sourcemap: false,
  },
});
