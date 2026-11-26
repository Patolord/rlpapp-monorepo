import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";

type Person = { _id: Id<"users">; name: string };

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** "Carlos", "Carlos e Davi", "Carlos, Davi e Enzo". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

/** Quem fez a etapa: "Você, Carlos e Davi" (o próprio usuário vem primeiro). */
export function stagePeopleLine(participants: Person[], currentUserId: Id<"users"> | null | undefined): string {
  const me = participants.some((person) => person._id === currentUserId);
  const others = participants.filter((person) => person._id !== currentUserId).map((person) => firstName(person.name));
  return joinNames(me ? ["Você", ...others] : others);
}

/** Com quem o usuário fez a etapa: "com Carlos e Davi"; `null` quando fez sozinho. */
export function stageCompanionsLine(participants: Person[], currentUserId: Id<"users"> | null | undefined): string | null {
  const others = participants.filter((person) => person._id !== currentUserId).map((person) => firstName(person.name));
  return others.length > 0 ? `com ${joinNames(others)}` : null;
}

/** Data curta da etapa: "18/11". */
export function stageDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
