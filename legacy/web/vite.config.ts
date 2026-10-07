import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Em desenvolvimento, /api vai para o serviço Nest (npm run dev na raiz).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: { "/api": "http://localhost:3000" },
  },
  build: { outDir: "dist", assetsDir: "assets", sourcemap: false },
});
