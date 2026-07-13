import { useMemo, useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import {
  AlertTriangle,
  Boxes,
  ChevronRight,
  DoorOpen,
  Loader2,
  Pencil,
  Plus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  EquipmentRow,
  type BuildingMatrixActions,
} from "@/components/engenharia/building-panel/building-matrix";
import { NewSystemDialog } from "@/components/engenharia/building-panel/edit-dialogs";
import type {
  HierarchyEnvironment,
  HierarchyItem,
  HierarchySystem,
  ProjectHierarchy,
} from "@/components/engenharia/building-panel/hierarchy";
import { cn } from "@/lib/utils";

type SystemLocation = {
  key: string;
  towerName: string;
  floorLabel: string;
  env: HierarchyEnvironment;
  items: HierarchyItem[];
};

type SystemViewGroup = {
  key: string;
  /** Sistema da obra; null para itens legados sem vínculo (só string). */
  system: HierarchySystem | null;
  label: string;
  /** Itens sem sistema algum (nem vínculo nem string) — exibem alerta. */
  missingSystem: boolean;
  locations: SystemLocation[];
  total: number;
  installed: number;
};

function locationLabel(
  location: SystemLocation,
  singleTower: boolean
): string {
  return [singleTower ? null : location.towerName, location.floorLabel, location.env.name]
    .filter(Boolean)
    .join(" · ");
}

/** Agrupa todos os equipamentos da obra por sistema e, dentro, por local. */
function groupBySystem(hierarchy: ProjectHierarchy): SystemViewGroup[] {
  const systemById = new Map(hierarchy.systems.map((s) => [s._id, s]));
  const groups = new Map<string, SystemViewGroup>();

  // Garante que sistemas sem equipamentos também apareçam na listagem.
  for (const system of hierarchy.systems) {
    groups.set(system._id, {
      key: system._id,
      system,
      label: system.name,
      missingSystem: false,
      locations: [],
      total: 0,
      installed: 0,
    });
  }

  for (const tower of hierarchy.towers) {
    for (const floor of tower.floors) {
      for (const env of floor.environments) {
        for (const item of env.equipment) {
          const missingSystem = !item.systemId && !item.system;
          const key =
            item.systemId ??
            (missingSystem ? "none" : `legacy:${item.system}`);
          let group = groups.get(key);
          if (!group) {
            group = {
              key,
              system: item.systemId
                ? systemById.get(item.systemId) ?? null
                : null,
              label: item.systemId
                ? systemById.get(item.systemId)?.name ?? item.system
                : missingSystem
                  ? "Sem sistema"
                  : item.system,
              missingSystem,
              locations: [],
              total: 0,
              installed: 0,
            };
            groups.set(key, group);
          }
          let location = group.locations.find((l) => l.key === env._id);
          if (!location) {
            location = {
              key: env._id,
              towerName: tower.name,
              floorLabel: floor.label,
              env,
              items: [],
            };
            group.locations.push(location);
          }
          location.items.push(item);
          group.total += 1;
          if (item.status === "operational") group.installed += 1;
        }
      }
    }
  }

  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Visão por sistema: lista compacta (nome + ambientes). Equipamentos só
 * aparecem ao expandir cada linha.
 */
export function SystemsPanel({
  projectId,
  now,
  actions,
}: {
  projectId: Id<"projects">;
  now: number;
  actions?: BuildingMatrixActions;
}) {
  const hierarchy = useQuery(api.projects.getHierarchy, {
    projectId,
  }) as ProjectHierarchy | null | undefined;
  const [newSystemOpen, setNewSystemOpen] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const groups = useMemo(
    () => (hierarchy ? groupBySystem(hierarchy) : []),
    [hierarchy]
  );

  const singleTower = (hierarchy?.towers.length ?? 0) <= 1;

  if (hierarchy === undefined) {
    return (
      <div className="flex min-h-48 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button size="xs" onClick={() => setNewSystemOpen(true)}>
          <Plus className="mr-1.5 size-3.5" />
          Novo sistema
        </Button>
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-14 text-center text-muted-foreground">
          <Boxes className="size-10" />
          <p className="max-w-sm text-sm">
            Nenhum sistema cadastrado ainda. Crie o primeiro sistema desta obra.
          </p>
          <Button size="sm" onClick={() => setNewSystemOpen(true)}>
            <Plus className="mr-1.5 size-4" />
            Novo sistema
          </Button>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {groups.map((group) => (
            <SystemRow
              key={group.key}
              group={group}
              singleTower={singleTower}
              now={now}
              actions={actions}
              open={expandedKey === group.key}
              onOpenChange={(open) =>
                setExpandedKey(open ? group.key : null)
              }
            />
          ))}
        </ul>
      )}

      <NewSystemDialog
        projectId={projectId}
        open={newSystemOpen}
        onOpenChange={setNewSystemOpen}
      />
    </div>
  );
}

function SystemRow({
  group,
  singleTower,
  now,
  actions,
  open,
  onOpenChange,
}: {
  group: SystemViewGroup;
  singleTower: boolean;
  now: number;
  actions?: BuildingMatrixActions;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const envSummary =
    group.locations.length === 0
      ? "Sem ambientes"
      : group.locations
          .map((location) => locationLabel(location, singleTower))
          .join(" · ");

  return (
    <li>
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <div className="flex items-start gap-1 px-3 py-2.5">
          <CollapsibleTrigger
            className={cn(
              "flex min-w-0 flex-1 items-start gap-2 rounded-md text-left outline-none",
              "hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
            )}
          >
            <ChevronRight
              className={cn(
                "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-90"
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium">
                  {group.label}
                  {group.system === null && !group.missingSystem && (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      (legado)
                    </span>
                  )}
                </span>
                {group.missingSystem && (
                  <AlertTriangle
                    className="size-3.5 shrink-0 text-amber-600"
                    aria-label="Equipamentos sem sistema"
                  />
                )}
                {group.system?.type && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[0.625rem] uppercase text-muted-foreground">
                    {group.system.type}
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {envSummary}
              </p>
            </div>
            <span className="mt-0.5 shrink-0 text-xs tabular-nums text-muted-foreground">
              {group.installed}/{group.total}
            </span>
          </CollapsibleTrigger>
          {group.system && actions?.onEditSystem && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                actions.onEditSystem?.(group.system!);
              }}
              className="mt-0.5 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`Editar sistema ${group.label}`}
            >
              <Pencil className="size-3.5" />
            </button>
          )}
        </div>

        <CollapsibleContent>
          <div className="space-y-3 border-t bg-muted/20 px-3 py-3">
            {group.locations.length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-foreground">
                Sem equipamentos neste sistema.
              </p>
            ) : (
              group.locations.map((location) => (
                <div key={location.key} className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <DoorOpen className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate text-xs font-medium text-muted-foreground">
                      {locationLabel(location, singleTower)}
                    </span>
                    {group.system && actions?.onAddEquipment && (
                      <Button
                        variant="ghost"
                        size="xs"
                        className="ml-auto h-6 px-1.5 text-xs"
                        onClick={() =>
                          actions.onAddEquipment?.(location.env, group.system)
                        }
                      >
                        <Plus className="mr-1 size-3" />
                        Equipamento
                      </Button>
                    )}
                  </div>
                  <ul className="space-y-2">
                    {location.items.map((item) => (
                      <EquipmentRow
                        key={item._id}
                        item={item}
                        env={location.env}
                        now={now}
                        actions={actions}
                      />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}
