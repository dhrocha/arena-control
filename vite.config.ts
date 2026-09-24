import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  server: {
    middlewareMode: true,
    // hmr.server é definido em runtime (server/index.ts) para compartilhar a porta 3000
  },
  appType: "custom",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
