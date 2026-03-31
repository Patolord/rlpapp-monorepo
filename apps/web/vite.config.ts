import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart(),
    nitro({
      preset: "vercel",
    }),
    viteReact(),
  ],
  resolve: {
    alias: [
      {
        find: /^use-sync-external-store\/shim(\/index\.js)?$/,
        replacement: path.resolve(
          __dirname,
          "src/lib/use-sync-external-store-shim.ts",
        ),
      },
    ],
  },
  server: {
    port: 3001,
  },
  optimizeDeps: {
    include: ["convex", "convex/react", "convex/react-clerk"],
  },
  ssr: {
    noExternal: ["convex"],
  },
});
