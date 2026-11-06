import type { HierarchySystem } from "@/components/engenharia/building-panel/hierarchy";

/** Dados mínimos de um sistema para os selects/dialogs (subset estrutural). */
export type SystemOption = Pick<HierarchySystem, "_id" | "name" | "type">;
