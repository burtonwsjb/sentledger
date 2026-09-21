import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";

export default defineConfig({
  root: "web",
  plugins: [react(), tailwind()],
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: { input: "web/app.html" },
    chunkSizeWarningLimit: 900,
  },
  server: { port: 5173, proxy: { "/v1": "http://localhost:8080", "/t": "http://localhost:8080", "/f": "http://localhost:8080" } },
});
