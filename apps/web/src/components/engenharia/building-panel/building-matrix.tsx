import { useEffect, useMemo, useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
  AlertTriangle,
  Boxes,
  Building2,
  DoorOpen,
  Link2,
  Loader2,
  Pencil,
  Plus,
  QrCode,
  Trash2,
  Unlink,
  Wind,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EquipmentStatusDot } from "@/components/engenharia/building-panel/equipment-status-dot";
import { FloorLegend } from "@/components/engenharia/building-panel/floor-grid";
import { TowerSelector } from "@/components/engenharia/building-panel/tower-selector";
import {
  EQUIPMENT_VISUAL_STYLES,
  FLOOR_STATE_STYLES,
  getEnvironmentState,
  getEquipmentVisualState,
  type HierarchyEnvironment,
  type HierarchyFloor,
  type HierarchyItem,
  type HierarchySystem,
  type HierarchyTower,
  type ProjectHierarchy,
} from "@/components/engenharia/building-panel/hierarchy";

/** Ações de edição opcionais. Sem elas, o painel é somente-leitura. */
export type BuildingMatrixActions = {
  onAddTower?: () => void;
  onEditTower?: (tower: HierarchyTower) => void;
  onAddFloors?: (tower: HierarchyTower) => void;
  onEditFloor?: (floor: HierarchyFloor) => void;
  onAddEnvironment?: (floor: HierarchyFloor) => void;
  onEditEnvironment?: (env: HierarchyEnvironment) => void;
  onRemoveEnvironment?: (env: HierarchyEnvironment) => void;
  /** Cria um sistema da obra a partir do ambiente selecionado. */
  onAddSystem?: (env: HierarchyEnvironment) => void;
  onEditSystem?: (system: HierarchySystem) => void;
  /** Adiciona equipamento no ambiente, com sistema pré-selecionado. */
  onAddEquipment?: (
    env: HierarchyEnvironment,
    system: HierarchySystem | null
  ) => void;
  onEditEquipment?: (item: HierarchyItem, env: HierarchyEnvironment) => void;
  onGenerateQr?: (item: HierarchyItem) => void;
  onLinkQr?: (item: HierarchyItem) => void;
  onUnlinkQr?: (item: HierarchyItem) => void;
  onRemoveEquipment?: (item: HierarchyItem) => void;
};

/**
 * Visualização principal do prédio em matriz (andares nas linhas, ambientes nas
 * colunas) lida da hierarquia Torre → Andar → Ambiente. Cada célula é colorida
 * pelo estado de instalação. Clicar abre o painel lateral com os detalhes.
 */
export function BuildingMatrixPanel({
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

  const towers = hierarchy?.towers ?? [];
  const [selectedTowerId, setSelectedTowerId] = useState<string | null>(null);
  const [selectedEnv, setSelectedEnv] = useState<{
    floorLabel: string;
    envId: string;
  } | null>(null);

  useEffect(() => {
    if (towers.length === 0) {
      setSelectedTowerId(null);
      return;
    }
    if (!towers.some((t) => t._id === selectedTowerId)) {
      setSelectedTowerId(towers[0]._id);
    }
  }, [towers, selectedTowerId]);

  const selectedTower = useMemo(
    () => towers.find((t) => t._id === selectedTowerId) ?? null,
    [towers, selectedTowerId]
  );

  // Mantém o painel lateral sincronizado com os dados reativos (ex: após
  // adicionar/remover um equipamento o sheet reflete na hora).
  const selectedEnvData = useMemo(() => {
    if (!selectedEnv || !selectedTower) return null;
    for (const floor of selectedTower.floors) {
      const env = floor.environments.find((e) => e._id === selectedEnv.envId);
      if (env) return { floorLabel: floor.label, env };
    }
    return null;
  }, [selectedEnv, selectedTower]);

  if (hierarchy === undefined) {
    return (
      <div className="flex min-h-48 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (towers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-14 text-center text-muted-foreground">
        <Building2 className="size-10" />
        <p className="max-w-sm text-sm">
          Nenhuma torre cadastrada ainda. Use o Assistente IA ao lado ou crie a
          torre manualmente.
        </p>
        {actions?.onAddTower && (
          <Button variant="outline" size="sm" onClick={actions.onAddTower}>
            <Plus className="mr-1.5 size-4" />
            Nova torre
          </Button>
        )}
      </div>
    );
  }

  const singleTower = towers.length === 1;

  return (
    <div className="space-y-4">
      <TowerSelector
        towers={towers}
        selectedTowerId={selectedTowerId}
        onSelect={(id) => setSelectedTowerId(id)}
        onEditTower={actions?.onEditTower}
      />

      {selectedTower && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {singleTower && (
                <>
                  <Building2 className="size-4 text-muted-foreground" />
                  <span className="font-semibold">{selectedTower.name}</span>
                  {actions?.onEditTower && (
                    <button
                      type="button"
                      onClick={() => actions.onEditTower?.(selectedTower)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Editar torre"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {actions?.onAddTower && (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={actions.onAddTower}
                >
                  <Plus className="mr-1 size-3.5" />
                  Nova torre
                </Button>
              )}
              {actions?.onAddFloors && (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => actions.onAddFloors?.(selectedTower)}
                >
                  <Plus className="mr-1 size-3.5" />
                  Andares
                </Button>
              )}
            </div>
          </div>

          <BuildingMatrix
            tower={selectedTower}
            now={now}
            actions={actions}
            onSelectEnvironment={(floorLabel, env) =>
              setSelectedEnv({ floorLabel, envId: env._id })
            }
          />

          <FloorLegend />
        </>
      )}

      <EnvironmentSheet
        data={selectedEnvData}
        systems={hierarchy?.systems ?? []}
        now={now}
        actions={actions}
        onClose={() => setSelectedEnv(null)}
      />
    </div>
  );
}

function BuildingMatrix({
  tower,
  now,
  actions,
  onSelectEnvironment,
}: {
  tower: HierarchyTower;
  now: number;
  actions?: BuildingMatrixActions;
  onSelectEnvironment: (floorLabel: string, env: HierarchyEnvironment) => void;
}) {
  const { floors, maxCols } = useMemo(() => {
    const sorted = tower.floors.slice().sort((a, b) => b.number - a.number);
    const max = sorted.reduce((m, f) => Math.max(m, f.environments.length), 1);
    return { floors: sorted, maxCols: max };
  }, [tower]);

  const editable = Boolean(actions?.onAddEnvironment);

  if (floors.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
        <p>Esta torre ainda não tem andares.</p>
        {actions?.onAddFloors && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => actions.onAddFloors?.(tower)}
          >
            <Plus className="mr-1.5 size-4" />
            Adicionar andares
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex min-w-fit flex-col">
        {/* Telhado / Cobertura */}
        <div className="flex">
          <div className="w-16 shrink-0" />
          <div className="flex-1">
            <div className="relative mx-1">
              <div className="h-3 rounded-t-lg bg-slate-700 dark:bg-slate-500" />
              <div className="h-1.5 bg-slate-600 dark:bg-slate-400" />
            </div>
          </div>
          {editable && <div className="w-10 shrink-0" />}
        </div>

        {/* Andares */}
        {floors.map((floor, idx) => (
          <MatrixRow
            key={floor._id}
            floor={floor}
            maxCols={maxCols}
            now={now}
            actions={actions}
            onSelectEnvironment={onSelectEnvironment}
            isLast={idx === floors.length - 1}
          />
        ))}

        {/* Base / Fundação */}
        <div className="flex">
          <div className="w-16 shrink-0" />
          <div className="flex-1">
            <div className="mx-1">
              <div className="h-2 bg-slate-600 dark:bg-slate-400" />
              <div className="h-3 rounded-b-md bg-slate-800 dark:bg-slate-600" />
            </div>
          </div>
          {editable && <div className="w-10 shrink-0" />}
        </div>
      </div>
    </div>
  );
}

function MatrixRow({
  floor,
  maxCols,
  now,
  actions,
  onSelectEnvironment,
  isLast,
}: {
  floor: HierarchyFloor;
  maxCols: number;
  now: number;
  actions?: BuildingMatrixActions;
  onSelectEnvironment: (floorLabel: string, env: HierarchyEnvironment) => void;
  isLast: boolean;
}) {
  const envs = floor.environments.slice().sort((a, b) => a.order - b.order);
  const editable = Boolean(actions?.onAddEnvironment);

  return (
    <div className="flex">
      {/* Rótulo do andar — como a marcação no shaft do elevador */}
      <div className="group flex w-16 shrink-0 flex-col items-end justify-center gap-0.5 pr-2">
        <div className="flex items-center gap-1">
          {actions?.onEditFloor && (
            <button
              type="button"
              onClick={() => actions.onEditFloor?.(floor)}
              className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
              aria-label={`Editar ${floor.label}`}
            >
              <Pencil className="size-3" />
            </button>
          )}
          <span className="text-sm font-bold tabular-nums text-slate-700 dark:text-slate-300">
            {floor.label}
          </span>
        </div>
      </div>

      {/* Fachada do andar */}
      <div className="flex flex-1 flex-col">
        {/* Laje superior (borda de concreto entre andares) */}
        <div className="mx-1 h-1 bg-slate-400/60 dark:bg-slate-500/60" />

        {/* Janelas / Ambientes */}
        <div
          className="mx-1 grid gap-2 bg-slate-200/50 px-2 py-2 dark:bg-slate-800/40"
          style={{
            gridTemplateColumns: `repeat(${maxCols}, minmax(7rem, 1fr))`,
          }}
        >
          {Array.from({ length: maxCols }).map((_, c) => {
            const env = envs[c];
            if (!env) {
              return (
                <div
                  key={`${floor._id}-empty-${c}`}
                  className="min-h-18 rounded-sm border border-slate-300/50 bg-slate-100/60 dark:border-slate-600/30 dark:bg-slate-700/20"
                />
              );
            }
            const state = getEnvironmentState(env, now);
            const style = state.overdue
              ? FLOOR_STATE_STYLES.overdue
              : FLOOR_STATE_STYLES[state.level];

            return (
              <button
                key={env._id}
                type="button"
                onClick={() => onSelectEnvironment(floor.label, env)}
                className={cn(
                  "flex min-h-18 flex-col gap-0.5 rounded-sm border-2 p-2 text-left shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5",
                  style.cell
                )}
              >
                <span className="flex items-center gap-1">
                  <span
                    className={cn("size-2 shrink-0 rounded-full", style.dot)}
                  />
                  <span className="truncate text-xs font-semibold">
                    {env.name}
                  </span>
                  {state.overdue && (
                    <AlertTriangle className="ml-auto size-3 shrink-0 text-red-600" />
                  )}
                </span>
                {env.type && (
                  <span className="truncate text-[0.625rem] uppercase text-muted-foreground">
                    {env.type}
                  </span>
                )}
                <span className="mt-auto text-[0.625rem] font-medium tabular-nums text-muted-foreground">
                  {state.total === 0
                    ? "sem equip."
                    : `${state.installed}/${state.total} equip.`}
                </span>
              </button>
            );
          })}
        </div>

        {/* Laje inferior (apenas no último andar) */}
        {isLast && (
          <div className="mx-1 h-1 bg-slate-400/60 dark:bg-slate-500/60" />
        )}
      </div>

      {/* Coluna do botão + ambiente */}
      {editable && (
        <div className="flex w-10 shrink-0 items-center justify-center">
          <button
            type="button"
            onClick={() => actions?.onAddEnvironment?.(floor)}
            className="flex size-7 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/30 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            aria-label={`Adicionar ambiente em ${floor.label}`}
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

/** Grupo de equipamentos de um ambiente pertencentes ao mesmo sistema. */
type EnvironmentSystemGroup = {
  key: string;
  /** Sistema da obra; null para itens legados sem vínculo (só string). */
  system: HierarchySystem | null;
  /** Nome exibido (nome do sistema ou string legada). */
  label: string;
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
    const key = item.systemId ?? `legacy:${item.system}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        system,
        label: system?.name ?? item.system,
        items: [],
      };
      groups.set(key, group);
    }
    group.items.push(item);
  }

  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function EnvironmentSheet({
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

  return (
    <Sheet open={data !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <div className="flex items-start justify-between">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <DoorOpen className="size-4 text-muted-foreground" />
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
              <div className="flex items-center gap-1">
                {actions?.onEditEnvironment && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => actions.onEditEnvironment?.(env)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                )}
                {actions?.onRemoveEnvironment && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive hover:text-destructive"
                    onClick={() => actions.onRemoveEnvironment?.(env)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-4 p-4">
          {!env || groups.length === 0 ? (
            <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
              Sem sistemas neste ambiente. Adicione um sistema para começar.
            </p>
          ) : (
            groups.map((group) => (
              <SystemGroup
                key={group.key}
                group={group}
                env={env}
                now={now}
                actions={actions}
              />
            ))
          )}
        </div>

        {actions?.onAddSystem && env && (
          <SheetFooter>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => actions.onAddSystem?.(env)}
            >
              <Plus className="mr-1.5 size-4" />
              Adicionar sistema
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
            className="ml-auto h-6 px-1.5 text-xs"
            onClick={() => actions.onAddEquipment?.(env, group.system)}
          >
            <Plus className="mr-1 size-3" />
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

export function EquipmentRow({
  item,
  env,
  now,
  actions,
}: {
  item: HierarchyItem;
  env: HierarchyEnvironment;
  now: number;
  actions?: BuildingMatrixActions;
}) {
  const visual = getEquipmentVisualState(item, now);
  const style = EQUIPMENT_VISUAL_STYLES[visual];

  return (
    <li className="space-y-1.5 rounded-lg border bg-muted/20 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <EquipmentStatusDot item={item} now={now} />
        <span className="flex items-center gap-1 text-muted-foreground">
          <Wind className="size-3" />
          {item.kind === "condensadora" ? "Condensadora" : "Evaporadora"}
        </span>
        <span className={cn("font-medium", style.text)}>{style.label}</span>
      </div>

      {(item.modelo || item.capacidade || item.serialNumber) && (
        <div className="flex flex-wrap gap-x-3 text-muted-foreground">
          {(item.modelo || item.capacidade) && (
            <span>
              {[item.modelo, item.capacidade].filter(Boolean).join(" · ")}
            </span>
          )}
          {item.serialNumber && <span>S/N {item.serialNumber}</span>}
        </div>
      )}

      {item.deadline && (
        <p className="text-muted-foreground">
          Prazo: {new Date(item.deadline).toLocaleDateString("pt-BR")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {item.token ? (
          <>
            <Link
              to="/engenharia/qr/$token"
              params={{ token: item.token }}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <QrCode className="size-3" />
              Ver QR
            </Link>
            {actions?.onUnlinkQr && (
              <Button
                variant="ghost"
                size="xs"
                className="h-6 px-1.5 text-xs text-muted-foreground"
                onClick={() => actions.onUnlinkQr?.(item)}
              >
                <Unlink className="mr-1 size-3" />
                Desvincular
              </Button>
            )}
          </>
        ) : (
          <>
            {actions?.onLinkQr && (
              <Button
                variant="outline"
                size="xs"
                className="h-6 px-1.5 text-xs"
                onClick={() => actions.onLinkQr?.(item)}
              >
                <Link2 className="mr-1 size-3" />
                Vincular QR
              </Button>
            )}
            {actions?.onGenerateQr && (
              <Button
                variant="ghost"
                size="xs"
                className="h-6 px-1.5 text-xs"
                onClick={() => actions.onGenerateQr?.(item)}
              >
                <QrCode className="mr-1 size-3" />
                Gerar QR
              </Button>
            )}
          </>
        )}
        {actions?.onEditEquipment && (
          <Button
            variant="ghost"
            size="xs"
            className="h-6 px-1.5 text-xs"
            onClick={() => actions.onEditEquipment?.(item, env)}
          >
            <Pencil className="size-3" />
          </Button>
        )}
        {actions?.onRemoveEquipment && (
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto h-6 px-1.5 text-destructive hover:text-destructive"
            onClick={() => actions.onRemoveEquipment?.(item)}
          >
            <Trash2 className="size-3" />
          </Button>
        )}
      </div>
    </li>
  );
}
