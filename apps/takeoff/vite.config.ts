import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const host = process.env.TAURI_DEV_HOST as string | undefined;

const appVersion = JSON.parse(readFileSync("./package.json", "utf8")).version as string;

export default defineConfig({
  define: { "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion) },
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**", "**/samples/**"] },
  },
  build: { target: "es2022", chunkSizeWarningLimit: 2000 },
  worker: { format: "es" },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
