import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/agent": {
        target: "http://localhost:4042",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/agent/, ""),
      },
      "/forge": {
        target: "http://localhost:4021",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/forge/, ""),
      },
    },
  },
});
