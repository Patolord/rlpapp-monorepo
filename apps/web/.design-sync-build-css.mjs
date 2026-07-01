// Compiles apps/web's Tailwind theme (src/index.css) into a standalone
// stylesheet for the @rlpapp/ui design-sync bundle. packages/ui ships no CSS
// of its own — its Tailwind utility classes only resolve through this app's
// theme tokens and its `@source "../../../packages/ui/src/web"` scan. An
// extra @source is added here (without touching the committed index.css) so
// utility classes used only in .design-sync/previews/*.tsx also compile.
// Run from anywhere: `node apps/web/.design-sync-build-css.mjs`.
import { build } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "../../packages/ui/.ds-cache");
const entry = path.join(outDir, ".ds-css-entry.css");

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  entry,
  `@import "${path.join(here, "src/index.css").replace(/\\/g, "/")}";\n` +
    `@source "${path.resolve(here, "../../.design-sync/previews").replace(/\\/g, "/")}";\n`,
);

await build({
  root: here,
  configFile: false,
  logLevel: "info",
  plugins: [tailwindcss()],
  build: {
    outDir,
    emptyOutDir: false,
    rollupOptions: { input: entry },
  },
});

const assetsDir = path.join(outDir, "assets");
const cssFile = fs.readdirSync(assetsDir).find((f) => f.endsWith(".css"));
const dest = path.join(outDir, "tailwind.css");
fs.copyFileSync(path.join(assetsDir, cssFile), dest);
fs.rmSync(entry, { force: true });
console.log(`wrote ${dest}`);
