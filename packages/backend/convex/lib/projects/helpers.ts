import type { Doc } from "../../_generated/dataModel";

export function isProjectArchived(project: Doc<"projects">): boolean {
  return (
    project.status === "archived" ||
    project.archivedAt !== undefined
  );
}

/** IDs de usuários com acesso ao portal (novo campo com fallback legado). */
export function getPortalUserIds(project: Doc<"projects">) {
  return project.portalUserIds ?? project.clientIds ?? [];
}

/** Rótulo legado do cliente (texto livre). */
export function getLegacyClientLabel(project: Doc<"projects">): string | undefined {
  return project.client?.trim() || undefined;
}
