import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
  server: {
    host: "0.0.0.0",
    port: 5008,
    strictPort: true,
    hmr: { clientPort: 5008 },
    watch: { usePolling: true, interval: 300 },
    proxy: {
      // changeOrigin: Host gre kot backend (sicer LAN IP → DisallowedHost HTML).
      "/api": { target: "http://backend:8000", changeOrigin: true },
      "/admin": { target: "http://backend:8000", changeOrigin: true },
      "/static": { target: "http://backend:8000", changeOrigin: true },
      "/ws": { target: "http://backend:8000", ws: true, changeOrigin: true },
    },
  },
});
