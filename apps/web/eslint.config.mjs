// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default [{ ignores: ["src/routeTree.gen.ts", "dist/**", ".vercel/**"] }, {
  files: ["src/**/*.{ts,tsx}"],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  plugins: {
    "@typescript-eslint": tseslint.plugin,
    "react-hooks": reactHooks,
  },
  rules: {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    "@typescript-eslint/no-floating-promises": "error",
  },
}, ...storybook.configs["flat/recommended"]];
