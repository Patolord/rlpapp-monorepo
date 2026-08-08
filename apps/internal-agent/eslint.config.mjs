import tseslint from "typescript-eslint";

export default [
  { ignores: [".eve/**", ".output/**", ".vercel/**", "dist/**"] },
  {
    files: ["agent/**/*.ts", "evals/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
];
