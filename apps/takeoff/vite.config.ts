import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const host = process.env.TAURI_DEV_HOST as string | undefined;

const appVersion = JSON.parse(readFileSync("./package.json", "utf8")).version as string;

export default defineConfig({
  define: { "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion) },
  plugins: [
    // The backend's generated Convex client is plain JS; left in the React plugin's (fast refresh)
    // scope, Vite transforms it with the root tsconfig, whose reference to apps/native extends
    // expo/tsconfig.base and fails wherever only this app's dependencies are installed (the
    // release workflow's `pnpm install --filter takeoff...`).
    react({ exclude: [/\/node_modules\//, /\/convex\/_generated\//] }),
    tailwindcss(),
  ],
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
