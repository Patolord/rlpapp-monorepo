import { AlertTriangle, Boxes, DoorOpen, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { BuildingMatrixActions } from "@/components/engenharia/building-panel/building-matrix";
import { EquipmentRow } from "@/components/engenharia/building-panel/equipment-row";
import {
  getEnvironmentState,
  type HierarchyEnvironment,
  type HierarchyItem,
  type HierarchySystem,
} from "@/components/engenharia/building-panel/hierarchy";

/** Grupo de equipamentos de um ambiente pertencentes ao mesmo sistema. */
type EnvironmentSystemGroup = {
  key: string;
  /** Sistema da obra; null para itens legados sem vínculo (só string). */
  system: HierarchySystem | null;
  /** Nome exibido (nome do sistema ou string legada). */
  label: string;
  /** Itens sem sistema algum (nem vínculo nem string) — exibem alerta. */
  missingSystem: boolean;
  items: HierarchyItem[];
};

function groupEquipmentBySystem(
  env: HierarchyEnvironment,
  systems: HierarchySystem[]
): EnvironmentSystemGroup[] {
  const systemById = new Map(systems.map((s) => [s._id, s]));
  const groups = new Map<string, EnvironmentSystemGroup>();

  for (const item of env.equipment) {
    const system = item.systemId
      ? systemById.get(item.systemId) ?? null
      : null;
    const missingSystem = !item.systemId && !item.system;
    const key =
      item.systemId ?? (missingSystem ? "none" : `legacy:${item.system}`);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        system,
        label: system?.name ?? (missingSystem ? "Sem sistema" : item.system),
        missingSystem,
        items: [],
      };
      groups.set(key, group);
    }
    group.items.push(item);
  }

  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function EnvironmentSheet({
  data,
  systems,
  now,
  actions,
  onClose,
}: {
  data: { floorLabel: string; env: HierarchyEnvironment } | null;
  systems: HierarchySystem[];
  now: number;
  actions?: BuildingMatrixActions;
  onClose: () => void;
}) {
  const env = data?.env ?? null;
  const state = env ? getEnvironmentState(env, now) : null;
  const groups = env ? groupEquipmentBySystem(env, systems) : [];

  // Adicionar equipamento abre o painel de cadastro rápido; fecha o sheet
  // para não cobrir o painel lateral.
  const sheetActions: BuildingMatrixActions | undefined = actions && {
    ...actions,
    onAddEquipment: actions.onAddEquipment
      ? (targetEnv, system) => {
          onClose();
          actions.onAddEquipment?.(targetEnv, system);
        }
      : undefined,
  };

  return (
    <Sheet open={data !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-md">
        <SheetHeader>
          {/* pr-12 leaves room for SheetContent's absolute close (top-3 right-3) */}
          <div className="flex items-start justify-between gap-2 pr-12">
            <div className="min-w-0">
              <SheetTitle className="flex items-center gap-2">
                <DoorOpen className="size-4 shrink-0 text-muted-foreground" />
                {env?.name ?? "Ambiente"}
              </SheetTitle>
              <SheetDescription>
                {data?.floorLabel}
                {env?.type ? ` · ${env.type}` : ""}
                {state
                  ? ` · ${state.installed}/${state.total} instalados`
                  : ""}
              </SheetDescription>
            </div>
            {env && (actions?.onEditEnvironment || actions?.onRemoveEnvironment) && (
              <div className="flex shrink-0 items-center gap-1">
                {actions?.onEditEnvironment && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => actions.onEditEnvironment?.(env)}
                  >
                    <Pencil />
                  </Button>
                )}
                {actions?.onRemoveEnvironment && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-destructive hover:text-destructive"
                    onClick={() => actions.onRemoveEnvironment?.(env)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-4 p-4">
          {!env || groups.length === 0 ? (
            <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
              Sem equipamentos neste ambiente. Adicione um equipamento para
              começar — o sistema é escolhido (ou criado) no próprio cadastro.
            </p>
          ) : (
            groups.map((group) => (
              <SystemGroup
                key={group.key}
                group={group}
                env={env}
                now={now}
                actions={sheetActions}
              />
            ))
          )}
        </div>

        {sheetActions?.onAddEquipment && env && (
          <SheetFooter>
            <Button
              className="w-full"
              onClick={() => sheetActions.onAddEquipment?.(env, null)}
            >
              <Plus />
              Adicionar equipamento
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SystemGroup({
  group,
  env,
  now,
  actions,
}: {
  group: EnvironmentSystemGroup;
  env: HierarchyEnvironment;
  now: number;
  actions?: BuildingMatrixActions;
}) {
  const installed = group.items.filter(
    (i) => i.status === "operational"
  ).length;

  return (
    <section className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Boxes className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-xs font-semibold uppercase tracking-wide">
          {group.label}
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
        <span className="text-[0.625rem] tabular-nums text-muted-foreground">
          {installed}/{group.items.length}
        </span>
        {group.system && actions?.onEditSystem && (
          <button
            type="button"
            onClick={() => actions.onEditSystem?.(group.system!)}
            className="text-muted-foreground hover:text-foreground"
            aria-label={`Editar sistema ${group.label}`}
          >
            <Pencil className="size-3" />
          </button>
        )}
        {actions?.onAddEquipment && (
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto"
            onClick={() => actions.onAddEquipment?.(env, group.system)}
          >
            <Plus />
            Equipamento
          </Button>
        )}
      </div>
      <ul className="space-y-2">
        {group.items.map((item) => (
          <EquipmentRow
            key={item._id}
            item={item}
            env={env}
            now={now}
            actions={actions}
          />
        ))}
      </ul>
    </section>
  );
}
