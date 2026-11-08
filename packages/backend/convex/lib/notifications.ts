import type { Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { notificationCategory } from "../schema";

// ---------------------------------------------------------------------------
// Avisos do app (A2: claude/rlpapp-native-notificacoes.md). `notify` grava uma
// linha por pessoa (o sino) e agenda o push pelo Expo para quem tem aparelho.
// Roda dentro da mesma mutation do evento: se a mutation falha, nada é avisado.
// Regras: quem fez a ação não é avisado; inativos ficam de fora; nada de valor
// em dinheiro no texto do push (decisão 39).
// ---------------------------------------------------------------------------

export type NotificationCategory = Infer<typeof notificationCategory>;

/** Códigos do catálogo da A2 (N1–N17). */
export type NotificationKind =
  | "N1"
  | "N2a"
  | "N2b"
  | "N3"
  | "N4"
  | "N5"
  | "N6"
  | "N7"
  | "N8"
  | "N9"
  | "N9b"
  | "N10"
  | "N11"
  | "N12"
  | "N13"
  | "N14"
  | "N16";

/** Destinos que o app sabe abrir (A3 §5). */
export type NotificationTarget =
  | "pedido"
  | "estoque_obra"
  | "aprovacao"
  | "movimentacao"
  | "obra"
  | "documentos"
  | "equipamento"
  | "predio_atraso"
  | "revisao_precos"
  | "takeoff"
  | "estoque_repor"
  | "rh_sincronizar"
  | "medicao";

export type NotificationInput = {
  kind: NotificationKind;
  category: NotificationCategory;
  title: string;
  body: string;
  /** Destino no app (`NotificationTarget`), resolvido pelo app por perfil. */
  target: NotificationTarget;
  params?: Record<string, string>;
  projectId?: Id<"projects">;
  /** false = só no sino, sem push (ex.: Atenção, medições). Padrão: true. */
  push?: boolean;
};

export const NOTIFICATION_RETENTION_DAYS = 60;
const TITLE_MAX = 60;
/** Teto de leitura de usuários ativos por aviso (a empresa tem dezenas). */
const MAX_ACTIVE_USERS = 1000;
const BODY_MAX = 160;

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Grava o aviso para cada destinatário e agenda o push. Devolve quantas
 * pessoas foram avisadas.
 */
export async function notify(
  ctx: MutationCtx,
  recipients: Iterable<Id<"users"> | null | undefined>,
  input: NotificationInput,
  options: { actorId?: Id<"users"> } = {}
): Promise<number> {
  const unique = new Set<Id<"users">>();
  for (const id of recipients) {
    if (id && id !== options.actorId) unique.add(id);
  }
  if (unique.size === 0) return 0;

  const wantsPush = input.push !== false;
  const now = Date.now();
  const title = clip(input.title, TITLE_MAX);
  const body = clip(input.body, BODY_MAX);
  const toPush: Id<"notifications">[] = [];
  let count = 0;

  for (const userId of unique) {
    const user = await ctx.db.get("users", userId);
    if (!user || !user.isActive) continue;
    const hasDevice = wantsPush ? await hasActiveToken(ctx, userId) : false;
    const id = await ctx.db.insert("notifications", {
      userId,
      kind: input.kind,
      category: input.category,
      title,
      body,
      projectId: input.projectId,
      target: input.target,
      params: input.params,
      push: wantsPush,
      createdAt: now,
      pushStatus: hasDevice ? "queued" : "skipped",
    });
    if (hasDevice) toPush.push(id);
    count += 1;
  }

  if (toPush.length > 0) {
    await ctx.scheduler.runAfter(0, internal.push.send, { ids: toPush });
  }
  return count;
}

async function hasActiveToken(ctx: QueryCtx, userId: Id<"users">): Promise<boolean> {
  const tokens = await ctx.db
    .query("pushTokens")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(20);
  return tokens.some((t) => t.disabledAt === undefined);
}

// ---------------------------------------------------------------------------
// Quem recebe
// ---------------------------------------------------------------------------

/** Usuários ativos de um departamento (staff). */
export async function activeUsersInDepartment(
  ctx: QueryCtx,
  department: NonNullable<Doc<"users">["department"]>
): Promise<Id<"users">[]> {
  const users = await ctx.db
    .query("users")
    .withIndex("by_active", (q) => q.eq("isActive", true))
    .take(MAX_ACTIVE_USERS);
  return users
    .filter((u) => u.department === department && u.role !== "client" && u.role !== "qr_operator")
    .map((u) => u._id);
}

/** Diretoria e administradores ativos. */
export async function activeAdmins(ctx: QueryCtx): Promise<Id<"users">[]> {
  const users = await ctx.db
    .query("users")
    .withIndex("by_active", (q) => q.eq("isActive", true))
    .take(MAX_ACTIVE_USERS);
  return users.filter((u) => u.role === "director" || u.role === "admin").map((u) => u._id);
}

/**
 * Quem decide pela engenharia numa obra: o responsável; sem responsável, o
 * departamento de engenharia (A2 §2.1, N1).
 */
export async function engineeringDeciders(
  ctx: QueryCtx,
  project: Doc<"projects">
): Promise<Id<"users">[]> {
  if (project.responsibleId) return [project.responsibleId];
  return await activeUsersInDepartment(ctx, "engenharia");
}
