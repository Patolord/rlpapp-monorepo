import { defineTable } from "convex/server";
import { v } from "convex/values";

// Avisos do app: sino, push pelo Expo e preferências por pessoa.

// Categorias que a pessoa liga e desliga em Mais › Notificações.
export const notificationCategory = v.union(
  v.literal("pedidos"),
  v.literal("aprovacoes"),
  v.literal("obras_documentos"),
  v.literal("equipamentos"),
  v.literal("compras_estoque"),
  v.literal("ponto"),
  v.literal("medicoes"),
  v.literal("andamento")
);

export const pushStatus = v.union(
  v.literal("queued"),
  v.literal("sent"),
  v.literal("skipped"),
  v.literal("failed")
);

export const notificationsTables = {
  // Token de push do Expo por aparelho. Um usuário pode ter vários aparelhos;
  // o token é desativado no Sair ou quando o Expo responde DeviceNotRegistered.
  pushTokens: defineTable({
    userId: v.id("users"),
    token: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android")),
    deviceName: v.optional(v.string()),
    appVersion: v.optional(v.string()),
    createdAt: v.number(),
    lastSeenAt: v.number(),
    disabledAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_token", ["token"]),

  // Aviso para uma pessoa. Tudo que vira push também fica aqui (o sino), por
  // 60 dias. `push: false` = só no sino (ex.: Atenção, medições).
  notifications: defineTable({
    userId: v.id("users"),
    kind: v.string(),
    category: notificationCategory,
    title: v.string(),
    body: v.string(),
    projectId: v.optional(v.id("projects")),
    // Destino no app (chave como "pedido" ou "obra", resolvida pelo app para
    // a aba do perfil) e os ids para abrir o item.
    target: v.string(),
    params: v.optional(v.record(v.string(), v.string())),
    push: v.boolean(),
    createdAt: v.number(),
    readAt: v.optional(v.number()),
    pushStatus: pushStatus,
    pushError: v.optional(v.string()),
  })
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_user_read", ["userId", "readAt"])
    .index("by_created", ["createdAt"]),

  // Recibo pendente do Expo: um ticket por aparelho avisado. O cron de 15 min
  // consulta os recibos e desliga o token de aparelho que saiu do app.
  pushTickets: defineTable({
    ticketId: v.string(),
    tokenId: v.id("pushTokens"),
    notificationId: v.id("notifications"),
    createdAt: v.number(),
  }).index("by_created", ["createdAt"]),

  // Preferências de push por pessoa (o sino recebe tudo de qualquer jeito).
  notificationPreferences: defineTable({
    userId: v.id("users"),
    pushOff: v.array(notificationCategory),
    // Horário silencioso 21h–6h (ligado por padrão): o push espera até as 6h;
    // o sino recebe na hora.
    quietHours: v.boolean(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
};
