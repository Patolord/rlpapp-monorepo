import { useMemo, useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { Plus, ScanLine, X, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ProjectHierarchy } from "@/components/engenharia/building-panel/hierarchy";
import { AddMode } from "@/components/engenharia/building-panel/quick-add-add-mode";
import {
  LinkMode,
  resolvePendingLinkItems,
} from "@/components/engenharia/building-panel/quick-add-link-mode";
import {
  resolveSelectedEnvs,
  SelectedEnvChips,
} from "@/components/engenharia/building-panel/quick-add-selected-envs";
import type { SystemOption } from "@/components/engenharia/building-panel/system-option";

type PanelMode = "add" | "link";

/**
 * Painel lateral de cadastro rápido: cria sistemas em massa (chips), adiciona
 * equipamentos a vários ambientes de uma vez (steppers, sem form) e vincula
 * QR codes — gerando novos automaticamente ou bipando etiquetas já impressas.
 */
export function QuickAddPanel({
  projectId,
  systems,
  selectedEnvIds,
  initialSystemId,
  onDeselectEnv,
  onClearSelection,
  onClose,
}: {
  projectId: Id<"projects">;
  systems: SystemOption[];
  selectedEnvIds: ReadonlySet<string>;
  /** Sistema pré-ativado (ex: botão "Equipamento" de um grupo de sistema). */
  initialSystemId: Id<"systems"> | null;
  onDeselectEnv: (envId: Id<"environments">) => void;
  onClearSelection: () => void;
  onClose: () => void;
}) {
  const hierarchy = useQuery(api.projects.getHierarchy, {
    projectId,
  }) as ProjectHierarchy | null | undefined;

  const [mode, setMode] = useState<PanelMode>("add");

  const selectedEnvs = useMemo(
    () => resolveSelectedEnvs(hierarchy, selectedEnvIds),
    [hierarchy, selectedEnvIds]
  );
  const pendingLinkItems = useMemo(
    () => resolvePendingLinkItems(hierarchy, selectedEnvIds),
    [hierarchy, selectedEnvIds]
  );

  return (
    <aside className="flex h-full flex-col gap-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        <Zap className="size-4 shrink-0 text-muted-foreground" />
        <h3 className="truncate text-sm font-semibold">Cadastro rápido</h3>
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          onClick={onClose}
          aria-label="Fechar cadastro rápido"
        >
          <X />
        </Button>
      </div>

      <div className="inline-flex rounded-md border bg-background p-0.5">
        <Button
          variant={mode === "add" ? "secondary" : "ghost"}
          size="xs"
          className="flex-1"
          onClick={() => setMode("add")}
        >
          <Plus />
          Adicionar
        </Button>
        <Button
          variant={mode === "link" ? "secondary" : "ghost"}
          size="xs"
          className="flex-1"
          onClick={() => setMode("link")}
        >
          <ScanLine />
          Vincular QRs
          {pendingLinkItems.length > 0 && (
            <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[0.625rem] tabular-nums text-muted-foreground">
              {pendingLinkItems.length}
            </span>
          )}
        </Button>
      </div>

      <SelectedEnvChips
        envs={selectedEnvs}
        multiTower={(hierarchy?.towers.length ?? 0) > 1}
        onDeselectEnv={onDeselectEnv}
        onClearSelection={onClearSelection}
      />

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {mode === "add" ? (
          <AddMode
            projectId={projectId}
            hierarchy={hierarchy}
            systems={systems}
            initialSystemId={initialSystemId}
            selectedEnvs={selectedEnvs}
          />
        ) : (
          <LinkMode
            projectId={projectId}
            systems={systems}
            selectedEnvs={selectedEnvs}
            items={pendingLinkItems}
            hasSelection={selectedEnvIds.size > 0}
          />
        )}
      </div>
    </aside>
  );
}
