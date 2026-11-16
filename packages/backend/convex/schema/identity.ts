import { defineTable } from "convex/server";
import { v } from "convex/values";

// Usuários, acessos, tokens de agente e auditoria.

// Cargo legado (`users.role`), lido só pela migração `migrations:migrateUserAccess`.
// O acesso vem de `users.roles`. Passo final (depois da migração rodar em
// produção): tornar `roles` obrigatório e remover `role`, `department` e
// este validador.
export const userRoles = v.union(
  v.literal("director"),
  v.literal("admin"),
  v.literal("manager"),
  v.literal("operator"),
  // Acesso restrito à área de engenharia (equipamentos, QR codes, manutenções)
  v.literal("engenheiro"),
  // Acesso restrito: só interage com equipamentos via página pública /q/$token
  v.literal("qr_operator"),
  // Acesso somente-leitura ao portal do cliente (obras atribuídas).
  v.literal("client")
);

// Acessos combináveis do usuário (ver @rlpapp/shared/auth/permissions).
export const accessRoles = v.union(
  v.literal("director"),
  v.literal("admin"),
  v.literal("engenheiro"),
  v.literal("engenharia"),
  v.literal("compras"),
  v.literal("estoque"),
  v.literal("rh"),
  v.literal("takeoff"),
  v.literal("qr_operator"),
  v.literal("client")
);

// Department types
export const departments = v.union(
  v.literal("rh"),
  v.literal("engenharia"),
  v.literal("compras"),
  v.literal("estoque")
);

// Permissão de um token de agente (MCP).
export const agentTokenPermission = v.union(
  v.literal("full_access"),
  v.literal("read_only")
);

// Origem de um token de agente: criado à mão em /conta/agentes ("agent") ou
// emitido pelo login de um app desktop, o RLP Takeoff ("device").
export const agentTokenKind = v.union(v.literal("agent"), v.literal("device"));

export const identityTables = {
  users: defineTable({
    name: v.string(),
    // Email é opcional: usuários podem ser criados apenas com username no Clerk.
    email: v.optional(v.string()),
    username: v.optional(v.string()),
    // Clerk user ID (subject do JWT). Optional para usuários criados antes do webhook.
    clerkId: v.optional(v.string()),
    // Acessos do usuário (fonte de verdade da autorização). Opcional só até a
    // migração `migrations:migrateUserAccess` rodar em produção; um documento
    // sem `roles` é lido pela tradução de role + department (rolesFromLegacy).
    roles: v.optional(v.array(accessRoles)),
    // Ajustes individuais por cima dos acessos (Configurações → Usuários):
    // permissões concedidas a mais e permissões do acesso retiradas. Valores
    // de PERMISSIONS no shared; guardados como string para que renomear ou
    // remover uma permissão do catálogo não invalide documentos (valores
    // desconhecidos são ignorados pela política).
    permissionGrants: v.optional(v.array(v.string())),
    permissionDenials: v.optional(v.array(v.string())),
    // Descontinuados: cargo e departamento. Nada grava nem lê estes campos
    // fora da migração, que também os apaga. Remover do schema no passo final.
    role: v.optional(userRoles),
    department: v.optional(departments),
    phone: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    lastLoginAt: v.optional(v.number()),
    // Convite por email (Configurações → Usuários): o cadastro nasce sem
    // clerkId e é vinculado quando a pessoa aceita o convite e cria a conta
    // (webhook user.created ou ensureUser, ambos pelo email). Enquanto não há
    // clerkId, o convite está pendente.
    invitedAt: v.optional(v.number()),
    // Id da invitation no Clerk, para reenviar ou revogar.
    clerkInvitationId: v.optional(v.string()),
  })
    .index("by_email", ["email"])
    .index("by_clerkId", ["clerkId"])
    .index("by_active", ["isActive"]),

  // --- Tokens de agente (MCP / acesso programático) ---
  // Credencial de longa duração que age em nome do usuário dono (mesma role e
  // permissões). Só o SHA-256 do token é guardado; o texto puro aparece uma
  // única vez, na criação. Usado pelo servidor MCP (apps/web /mcp) no lugar do
  // OAuth do Clerk: o token é trocado por um JWT de delegação curto cujo `sub`
  // é o clerkId do dono. Revogação e modo somente-leitura são aplicados
  // centralmente em lib/agentTokens.ts.
  agentTokens: defineTable({
    userId: v.id("users"),
    name: v.string(),
    /** SHA-256 (hex) do token em texto puro; usado na busca a cada pedido. */
    tokenHash: v.string(),
    /** Primeiros caracteres do token (`rlp_` + 8) para identificar na lista. */
    tokenPrefix: v.string(),
    /** `read_only` só executa queries; mutations e actions são rejeitadas. */
    permission: agentTokenPermission,
    createdAt: v.number(),
    /** Atualizado no máximo uma vez por minuto. */
    lastUsedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    /** Ausente = "agent" (tokens anteriores ao login do desktop). */
    kind: v.optional(agentTokenKind),
    /**
     * Só tokens de dispositivo: id aleatório da instalação do RLP Takeoff,
     * gerado uma vez pelo app. Um novo login da mesma instalação revoga o
     * token anterior dela (o nome do computador é só rótulo e pode repetir).
     */
    installationId: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_tokenHash", ["tokenHash"]),
  // Códigos de uso único do login do RLP Takeoff (desktop). A página web
  // /takeoff/conectar cria um código ligado ao usuário logado e ao desafio
  // PKCE do app; o app troca o código (com o verificador) por um token de
  // dispositivo em POST /takeoff/auth/exchange. Só o hash fica gravado.
  takeoffAuthCodes: defineTable({
    userId: v.id("users"),
    /** SHA-256 (hex) do código em texto puro. */
    codeHash: v.string(),
    /** Desafio PKCE S256 (base64url do SHA-256 do verificador). */
    codeChallenge: v.string(),
    /** Nome do computador, mostrado no token criado ("Takeoff · <device>"). */
    device: v.string(),
    /** Id da instalação do app (ver agentTokens.installationId). */
    installationId: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_codeHash", ["codeHash"])
    .index("by_user", ["userId"]),
  // Uma linha por chamada de ferramenta feita via MCP com um token de agente.
  // Alimenta "Atividade recente" na página Agentes. Expurgado pelo cron após
  // AGENT_TOKEN_CALL_RETENTION_DAYS (model/identity/agentTokenCalls.ts).
  agentTokenCalls: defineTable({
    tokenId: v.id("agentTokens"),
    userId: v.id("users"),
    /** Nome da ferramenta MCP (ex.: `list_projects`, `call_function`). */
    tool: v.string(),
    /** Função Convex chamada, `modulo:funcao`. */
    functionPath: v.optional(v.string()),
    outcome: v.union(v.literal("success"), v.literal("error")),
    errorMessage: v.optional(v.string()),
    durationMs: v.number(),
    createdAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_token", ["tokenId", "createdAt"])
    .index("by_user", ["userId", "createdAt"]),

  // --- Auditoria ---
  // Log de auditoria do sistema (todas as escritas relevantes).
  auditLogs: defineTable({
    userId: v.id("users"),
    action: v.string(),
    tableName: v.string(),
    recordId: v.string(),
    details: v.optional(v.string()),
    entityLabel: v.optional(v.string()),
    source: v.optional(v.string()),
    schemaVersion: v.optional(v.number()),
    changes: v.optional(
      v.array(
        v.object({
          field: v.string(),
          previousValue: v.optional(v.string()),
          newValue: v.optional(v.string()),
        })
      )
    ),
    snapshotBefore: v.optional(v.string()),
    snapshotAfter: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_table", ["tableName", "createdAt"])
    .index("by_record", ["tableName", "recordId", "createdAt"]),
};
