import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "frontend",
  plugins: [react()],
  build: { outDir: "../dist/frontend", emptyOutDir: true },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/v1": "http://127.0.0.1:3000" },
  },
});
