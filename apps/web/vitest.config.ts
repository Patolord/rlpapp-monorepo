import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: "unit",
    environment: "node",
    include: ["src/lib/mcp/**/*.test.ts"],
  },
});
