import { defineConfig } from "vite"
import desktopPlugin from "./vite"

export default defineConfig({
  plugins: [desktopPlugin] as any,
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    port: 3000,
    proxy: {
      // Specific paths with rewrite rules (must come first)
      "/api/session": {
        target: "http://127.0.0.1:4096",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/session/, "/session-events"),
      },
      // Generic paths
      "/auth": {
        target: "http://127.0.0.1:4096",
        changeOrigin: true,
        rewrite: (path) => path,
      },
      "/skill": "http://127.0.0.1:4096",
      "/session": "http://127.0.0.1:4096",
      "/session-events": "http://127.0.0.1:4096",
      "/project": "http://127.0.0.1:4096",
      "/docker": "http://127.0.0.1:4096",
      "/global": "http://127.0.0.1:4096",
      "/health": "http://127.0.0.1:4096",
      // Catch-all for other /api paths
      "/api": {
        target: "http://127.0.0.1:4096",
        changeOrigin: true,
        rewrite: (path) => path,
      },
    },
  },
  build: {
    target: "esnext",
    // sourcemap: true,
  },
  optimizeDeps: {
    exclude: ["@novnc/novnc"],
  },
  resolve: {
    alias: {
      "@novnc/novnc": "@novnc/novnc/lib/rfb.js",
    },
  },
})
