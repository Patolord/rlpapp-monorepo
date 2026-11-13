import convexPlugin from "@convex-dev/eslint-plugin";
import tseslint from "typescript-eslint";

// Arquivos de lib/, gateway/, mcp/, schema/ e model/ não importam os arquivos
// públicos da raiz de convex/.
const NO_PUBLIC_FILE_IMPORT = {
  regex: "^(\\.\\./)+(?!_generated$|lib$|model$|schema$|mcp$)[A-Za-z]+(\\.js)?$",
  message:
    "lib/, model/, schema/ e gateway/ não importam arquivos públicos da raiz de convex/.",
};

// Domínios de model/ e de quais outros cada um pode importar (CONTEXT.md,
// "Mapa de contextos"). Todos podem usar o núcleo compartilhado (kernel), que
// não importa nenhum domínio. Domínio novo entra aqui.
export const DOMAIN_DEPENDENCIES = {
  kernel: [],
  identity: [],
  notifications: [],
  engineering: ["notifications"],
  contracts: ["engineering", "notifications"],
  procurement: ["engineering", "notifications"],
  inventory: ["engineering", "procurement", "notifications"],
  hr: [],
  ai: ["engineering"],
};

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
  // Arquivos da raiz de convex/ são a API pública (o caminho vira `api.x.y`).
  // Eles só importam de _generated, lib/, model/, schema/, mcp/ e gateway/ (rotas
  // HTTP registradas em http.ts); nunca uns dos outros. Código reaproveitado
  // mora em model/<domínio> (ver convex/README.md).
  {
    files: ["convex/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^\\./(?!_generated/|lib/|model/|schema(/|$)|mcp/|gateway/)",
              message:
                "Arquivo público não importa outro arquivo público: mova o código para model/<domínio>.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["convex/{lib,gateway,mcp,schema}/*.ts"],
    // O catálogo gerado indexa todos os módulos públicos de propósito.
    ignores: ["convex/mcp/catalog.generated.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [NO_PUBLIC_FILE_IMPORT] }],
    },
  },
  // Mapa de contextos (CONTEXT.md): cada domínio de model/ só importa os
  // domínios de que depende. O grafo é acíclico; quem fica "abaixo" não sabe
  // de quem fica "acima".
  ...Object.entries(DOMAIN_DEPENDENCIES).map(([domain, allowed]) => {
    const forbidden = Object.keys(DOMAIN_DEPENDENCIES).filter(
      (other) =>
        other !== domain && !allowed.includes(other) && (other !== "kernel" || domain === "kernel")
    );
    return {
      files: [`convex/model/${domain}/*.ts`],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              NO_PUBLIC_FILE_IMPORT,
              ...(forbidden.length
                ? [
                    {
                      regex: `^\\.\\./(${forbidden.join("|")})/`,
                      message: `model/${domain} só depende de: ${
                        domain === "kernel"
                          ? "nenhum domínio"
                          : [...allowed, "kernel"].join(", ")
                      } (mapa de contextos em CONTEXT.md). Mova o código para o domínio de baixo ou inverta a chamada.`,
                    },
                  ]
                : []),
            ],
          },
        ],
      },
    };
  }),
  // Recusa que o usuário pode causar sai como ConvexError tipado: `Error`
  // comum vira "Server Error" em produção e a mensagem some.
  {
    files: ["convex/*.ts", "convex/model/**/*.ts", "convex/lib/*.ts"],
    ignores: ["convex/migrations.ts", "convex/lib/apiCrypto.ts", "convex/lib/agentTokens.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Error']",
          message:
            "Use notFound / alreadyExists / ruleViolation (lib/domainErrors) ou unauthenticated / forbidden (lib/accessErrors): `Error` comum vira \"Server Error\" em produção. Defeito interno que o usuário não resolve: eslint-disable-next-line com o motivo.",
        },
        {
          selector: "NewExpression[callee.name='ConvexError'] > Literal:first-child",
          message:
            "ConvexError com texto solto não tem código: use os construtores de lib/domainErrors.",
        },
      ],
    },
  },
];
