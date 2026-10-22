import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5008,
    strictPort: true,
    hmr: { clientPort: 5008 },
    watch: { usePolling: true, interval: 300 },
    proxy: {
      "/api": { target: "http://backend:8000" },
      "/admin": { target: "http://backend:8000" },
      "/static": { target: "http://backend:8000" },
      "/ws": { target: "http://backend:8000", ws: true },
    },
  },
});
