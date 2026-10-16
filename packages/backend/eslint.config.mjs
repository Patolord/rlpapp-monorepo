import convexPlugin from "@convex-dev/eslint-plugin";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["convex/_generated/**", "node_modules/**"] },
  {
    // Diretivas eslint-disable obsoletas escondem o motivo real da exceção
    linterOptions: { reportUnusedDisableDirectives: "error" },
  },
  ...convexPlugin.configs.recommended,
  {
    files: ["convex/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      // Regras opcionais do plugin Convex (fora do "recommended")
      // .collect() em query lê a tabela inteira; prefira índice + .take()/.paginate()
      "@convex-dev/no-collect-in-query": "warn",
      // Arquivos "use node" não podem ser importados pelo runtime padrão do Convex
      "@convex-dev/import-wrong-runtime": "error",

      // Promises não aguardadas em mutations causam comportamento imprevisível
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",

      // Validadores e tipos gerados cobrem tudo; `any` derruba essa garantia
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-deprecated": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          caughtErrors: "none",
          // `const { _id, ...rest } = doc` é o jeito idiomático de omitir campos
          ignoreRestSiblings: true,
        },
      ],
    },
  },
];
