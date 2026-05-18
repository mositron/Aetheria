import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/auth": "http://localhost:2567",
      "/leaderboard": "http://localhost:2567",
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
