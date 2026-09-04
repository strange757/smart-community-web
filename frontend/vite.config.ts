import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { fileURLToPath, URL } from "node:url"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const moduleId = id.replace(/\\/g, "/")
          if (!moduleId.includes("node_modules")) return
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(moduleId)) return "react-vendor"
          if (moduleId.includes("node_modules/@radix-ui/") || moduleId.includes("node_modules/lucide-react/")) return "ui-vendor"
          if (moduleId.includes("node_modules/@tanstack/")) return "query-vendor"
          return "vendor"
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    globals: true,
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
})
