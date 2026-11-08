import type { Href } from "expo-router";
import {
  Bell,
  Building2,
  ClipboardCheck,
  Clock,
  Cpu,
  Package,
  Ruler,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react-native";

import type { Profile } from "@/lib/profile";

// ---------------------------------------------------------------------------
// Avisos do app no lado do celular (A2: claude/rlpapp-native-notificacoes.md):
// categorias por perfil (§4), para onde cada aviso leva (A3 §5, decisão 46) e
// agrupamento da central por dia (§3).
// ---------------------------------------------------------------------------

export type NotificationCategory =
  | "pedidos"
  | "aprovacoes"
  | "obras_documentos"
  | "equipamentos"
  | "compras_estoque"
  | "ponto"
  | "medicoes"
  | "andamento";

export const CATEGORY_META: Record<NotificationCategory, { label: string; description: string; icon: LucideIcon }> = {
  pedidos: { label: "Pedidos de material", description: "Pedido novo, aprovado, recusado e enviado", icon: Package },
  aprovacoes: { label: "Aprovações de estoque", description: "Envio que quebra regra e a decisão do engenheiro", icon: ClipboardCheck },
  obras_documentos: { label: "Obras e documentos", description: "Nova obra na sua lista e documento novo", icon: Building2 },
  equipamentos: { label: "Equipamentos", description: "Equipamento com erro e prazos vencidos", icon: Cpu },
  compras_estoque: { label: "Compras e estoque", description: "Fila de revisão, orçamento do Takeoff e estoque baixo", icon: ShoppingCart },
  ponto: { label: "Ponto", description: "Sincronização do RHID", icon: Clock },
  medicoes: { label: "Medições", description: "Medição aprovada ou paga (só na central)", icon: Ruler },
  andamento: { label: "Andamento da obra", description: "Resumo semanal", icon: Bell },
};

/** Categorias com push que cada perfil recebe (A2 §4). Medições não têm push. */
export const PROFILE_CATEGORIES: Record<Profile, NotificationCategory[]> = {
  tecnico: ["pedidos", "obras_documentos"],
  engenharia: ["pedidos", "aprovacoes", "equipamentos"],
  estoque: ["pedidos", "aprovacoes", "compras_estoque"],
  compras: ["compras_estoque"],
  rh: ["ponto"],
  diretoria: [],
  sem_area: [],
  cliente: [],
};

/** Quem tem sino (decisão 36: o cliente não tem nesta versão). */
export function hasBell(profile: Profile): boolean {
  return profile !== "cliente";
}

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

export const UNAVAILABLE_HREF = "/notificacoes/indisponivel" as Href;

/**
 * Tela que o aviso abre, dentro da aba do perfil (A3 §5). `null` quando falta
 * o que abrir: a central mostra "Este item não está mais disponível".
 */
export function hrefForNotification(
  target: string,
  params: Record<string, string> | null,
  profile: Profile
): Href | null {
  const p = params ?? {};
  const projectId = p.projectId;
  const field = profile === "tecnico";
  switch (target as NotificationTarget) {
    case "pedido":
      if (profile === "estoque" || profile === "diretoria") return "/(tabs)/estoque/requisicoes" as Href;
      return projectId ? (`/obra/${projectId}/estoque` as Href) : ("/(tabs)/estoque/requisicoes" as Href);
    case "estoque_obra":
      if (!projectId) return null;
      return (field ? `/campo/obra/${projectId}/estoque` : `/obra/${projectId}/estoque`) as Href;
    case "aprovacao":
      return (p.documentId ? `/aprovacoes?documentId=${p.documentId}` : "/aprovacoes") as Href;
    case "movimentacao":
      return (p.documentId ? `/(tabs)/estoque/movimentacoes?documentId=${p.documentId}` : "/(tabs)/estoque/movimentacoes") as Href;
    case "obra":
      if (!projectId) return null;
      return (field ? `/campo/obra/${projectId}` : `/obra/${projectId}`) as Href;
    case "documentos":
      if (!projectId) return null;
      return (field ? `/campo/obra/${projectId}/documentos` : `/obra/${projectId}`) as Href;
    case "equipamento":
      if (p.token) {
        return (field && projectId
          ? `/campo/obra/${projectId}/equipamento/${p.token}`
          : `/equipamento/${p.token}`) as Href;
      }
      return projectId ? (`/obra/${projectId}/predio` as Href) : null;
    case "predio_atraso":
      return projectId ? (`/obra/${projectId}/predio?filtro=atraso` as Href) : null;
    case "revisao_precos":
      return "/(tabs)/compras/fila-revisao" as Href;
    case "takeoff":
      return projectId ? (`/obra/${projectId}/orcamento` as Href) : ("/(tabs)/compras" as Href);
    case "estoque_repor":
      return "/(tabs)/estoque?filtro=repor" as Href;
    case "rh_sincronizar":
      return "/ponto-equipe/sincronizar" as Href;
    case "medicao":
      return projectId ? (`/obra/${projectId}/medicoes` as Href) : null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Datas da central
// ---------------------------------------------------------------------------

export type DayGroup = "Hoje" | "Ontem" | "Esta semana" | "Antes";

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dayGroupOf(createdAt: number, now: number): DayGroup {
  const today = startOfDay(now);
  const day = startOfDay(createdAt);
  const diffDays = Math.round((today - day) / 86_400_000);
  if (diffDays <= 0) return "Hoje";
  if (diffDays === 1) return "Ontem";
  if (diffDays < 7) return "Esta semana";
  return "Antes";
}

export function groupByDay<T extends { createdAt: number }>(items: T[], now: number): { title: DayGroup; data: T[] }[] {
  const order: DayGroup[] = ["Hoje", "Ontem", "Esta semana", "Antes"];
  const map = new Map<DayGroup, T[]>();
  for (const item of items) {
    const g = dayGroupOf(item.createdAt, now);
    map.set(g, [...(map.get(g) ?? []), item]);
  }
  return order.filter((g) => map.has(g)).map((g) => ({ title: g, data: map.get(g) ?? [] }));
}

/** "14:05" hoje e ontem; "seg 14:05" na semana; "03/11" antes. */
export function timeLabel(createdAt: number, now: number): string {
  const d = new Date(createdAt);
  const hhmm = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const group = dayGroupOf(createdAt, now);
  if (group === "Hoje" || group === "Ontem") return hhmm;
  if (group === "Esta semana") {
    return `${d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")} ${hhmm}`;
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function badgeLabel(count: number): string {
  return count > 9 ? "9+" : String(count);
}
