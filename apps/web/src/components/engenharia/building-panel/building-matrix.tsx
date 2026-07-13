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
  environmentShapeRowSpan,
  EQUIPMENT_VISUAL_STYLES,
  FLOOR_STATE_STYLES,
  getEnvironmentState,
  getEquipmentVisualState,
  resolveMatrixLayout,
  type HierarchyEnvironment,
  type HierarchyFloor,
  type HierarchyItem,
  type HierarchySystem,
  type HierarchyTower,
  type MatrixCell,
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
 *
 * Em `selectionMode` (painel de equipamentos não atribuídos aberto), clicar em
 * uma célula apenas a marca como alvo da atribuição (destacada), sem abrir o
 * sheet de detalhes.
 *
 * Em `multiSelectMode` (painel de cadastro rápido aberto), clicar em células
 * alterna a seleção múltipla de ambientes; clicar no rótulo do andar alterna o
 * andar inteiro.
 */
export function BuildingMatrixPanel({
  projectId,
  now,
  actions,
  selectionMode = false,
  selectedTargetEnvId = null,
  onSelectTarget,
  multiSelectMode = false,
  multiSelectedEnvIds,
  onToggleEnv,
  onToggleFloor,
}: {
  projectId: Id<"projects">;
  now: number;
  actions?: BuildingMatrixActions;
  selectionMode?: boolean;
  selectedTargetEnvId?: string | null;
  onSelectTarget?: (floorLabel: string, env: HierarchyEnvironment) => void;
  multiSelectMode?: boolean;
  multiSelectedEnvIds?: ReadonlySet<string>;
  onToggleEnv?: (env: HierarchyEnvironment) => void;
  onToggleFloor?: (floor: HierarchyFloor) => void;
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
    const floors = selectedTower.floors
      .slice()
      .sort((a, b) => b.number - a.number);
    for (let idx = 0; idx < floors.length; idx++) {
      const floor = floors[idx];
      const env = floor.environments.find((e) => e._id === selectedEnv.envId);
      if (!env) continue;
      // Formas com mais de um andar mostram o intervalo de andares ocupados.
      const rowSpan = Math.min(environmentShapeRowSpan(env), idx + 1);
      const floorLabel =
        rowSpan > 1
          ? `${floor.label} – ${floors[idx - (rowSpan - 1)].label}`
          : floor.label;
      return { floorLabel, env };
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
            highlightEnvId={selectionMode ? selectedTargetEnvId : null}
            selectedEnvIds={multiSelectMode ? multiSelectedEnvIds : undefined}
            onToggleFloor={multiSelectMode ? onToggleFloor : undefined}
            onSelectEnvironment={(floorLabel, env) => {
              if (multiSelectMode && onToggleEnv) {
                onToggleEnv(env);
                return;
              }
              if (selectionMode && onSelectTarget) {
                onSelectTarget(floorLabel, env);
                return;
              }
              setSelectedEnv({ floorLabel, envId: env._id });
            }}
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
  highlightEnvId = null,
  selectedEnvIds,
  onToggleFloor,
  onSelectEnvironment,
}: {
  tower: HierarchyTower;
  now: number;
  actions?: BuildingMatrixActions;
  /** Ambiente destacado como alvo da atribuição (modo seleção). */
  highlightEnvId?: string | null;
  /** Ambientes selecionados no modo de multisseleção (cadastro rápido). */
  selectedEnvIds?: ReadonlySet<string>;
  /** Alterna a seleção de todos os ambientes do andar (multisseleção). */
  onToggleFloor?: (floor: HierarchyFloor) => void;
  onSelectEnvironment: (floorLabel: string, env: HierarchyEnvironment) => void;
}) {
  const layout = useMemo(() => resolveMatrixLayout(tower), [tower]);
  const { floors, cols, cells, emptySlots } = layout;

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

  // Colunas do grid: rótulo do andar + colunas da matriz + botão de adicionar.
  const gridTemplateColumns = `4rem repeat(${cols}, minmax(7rem, 1fr))${
    editable ? " 2.5rem" : ""
  }`;

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

        {/* Andares — um único grid para permitir células que atravessam
            andares (duplex/triplex) e colunas (halls largos). */}
        <div
          className="grid"
          style={{
            gridTemplateColumns,
            gridAutoRows: "minmax(5.5rem, auto)",
          }}
        >
          {/* Fachada: uma faixa de fundo por andar, com laje superior. */}
          {floors.map((floor, idx) => (
            <div
              key={`facade-${floor._id}`}
              className={cn(
                "mx-1 border-t-4 border-slate-400/60 bg-slate-200/50 dark:border-slate-500/60 dark:bg-slate-800/40",
                idx === floors.length - 1 &&
                  "border-b-4 border-b-slate-400/60 dark:border-b-slate-500/60"
              )}
              style={{
                gridRow: idx + 1,
                gridColumn: `2 / span ${cols}`,
              }}
            />
          ))}

          {/* Rótulos dos andares — como a marcação no shaft do elevador */}
          {floors.map((floor, idx) => (
            <div
              key={`label-${floor._id}`}
              className="group flex flex-col items-end justify-center gap-0.5 pr-2"
              style={{ gridRow: idx + 1, gridColumn: 1 }}
            >
              <div className="flex items-center gap-1">
                {actions?.onEditFloor && !onToggleFloor && (
                  <button
                    type="button"
                    onClick={() => actions.onEditFloor?.(floor)}
                    className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                    aria-label={`Editar ${floor.label}`}
                  >
                    <Pencil className="size-3" />
                  </button>
                )}
                {onToggleFloor ? (
                  <button
                    type="button"
                    onClick={() => onToggleFloor(floor)}
                    className="rounded px-1 text-sm font-bold tabular-nums text-slate-700 underline decoration-dotted underline-offset-2 transition-colors hover:bg-primary/10 hover:text-primary dark:text-slate-300"
                    aria-label={`Selecionar todos os ambientes de ${floor.label}`}
                    title="Selecionar/desselecionar o andar inteiro"
                  >
                    {floor.label}
                  </button>
                ) : (
                  <span className="text-sm font-bold tabular-nums text-slate-700 dark:text-slate-300">
                    {floor.label}
                  </span>
                )}
              </div>
            </div>
          ))}

          {/* Buracos do recorte do prédio (posições sem ambiente). */}
          {emptySlots.map((slot) => (
            <div
              key={`empty-${slot.row}-${slot.col}`}
              className="m-2 rounded-sm border border-slate-300/50 bg-slate-100/60 dark:border-slate-600/30 dark:bg-slate-700/20"
              style={{ gridRow: slot.row, gridColumn: slot.col + 1 }}
            />
          ))}

          {/* Janelas / Ambientes */}
          {cells.map((cell) => (
            <MatrixCellButton
              key={`${cell.env._id}:${cell.segmentIndex}`}
              cell={cell}
              now={now}
              highlighted={
                cell.env._id === highlightEnvId ||
                (selectedEnvIds?.has(cell.env._id) ?? false)
              }
              onSelectEnvironment={onSelectEnvironment}
            />
          ))}

          {/* Botões + ambiente (um por andar) */}
          {editable &&
            floors.map((floor, idx) => (
              <div
                key={`add-${floor._id}`}
                className="flex items-center justify-center"
                style={{ gridRow: idx + 1, gridColumn: cols + 2 }}
              >
                <button
                  type="button"
                  onClick={() => actions?.onAddEnvironment?.(floor)}
                  className="flex size-7 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/30 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  aria-label={`Adicionar ambiente em ${floor.label}`}
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
            ))}
        </div>

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

function MatrixCellButton({
  cell,
  now,
  highlighted = false,
  onSelectEnvironment,
}: {
  cell: MatrixCell;
  now: number;
  highlighted?: boolean;
  onSelectEnvironment: (floorLabel: string, env: HierarchyEnvironment) => void;
}) {
  const { env, floor } = cell;
  const state = getEnvironmentState(env, now);
  const style = state.overdue
    ? FLOOR_STATE_STYLES.overdue
    : FLOOR_STATE_STYLES[state.level];

  const floorLabel = cell.topFloorLabel
    ? `${floor.label} – ${cell.topFloorLabel}`
    : floor.label;
  const spanBadge =
    cell.shapeRowSpan === 2
      ? "Duplex"
      : cell.shapeRowSpan === 3
        ? "Triplex"
        : null;

  const isPrimary = cell.segmentIndex === 0;
  // Lados encostados em outro retângulo do mesmo ambiente colam no vizinho
  // (sem margem/raio) e escondem a borda de um dos lados para unir a forma.
  const merged =
    cell.flushTop || cell.flushRight || cell.flushBottom || cell.flushLeft;

  return (
    <button
      type="button"
      onClick={() => onSelectEnvironment(floorLabel, env)}
      className={cn(
        "m-2 flex min-h-18 flex-col gap-0.5 rounded-sm border-2 p-2 text-left shadow-sm transition-all hover:shadow-md",
        !merged && "hover:-translate-y-0.5",
        cell.flushTop && "mt-0 rounded-t-none",
        cell.flushRight && "mr-0 rounded-r-none",
        cell.flushBottom && "mb-0 rounded-b-none",
        cell.flushLeft && "ml-0 rounded-l-none",
        style.cell,
        highlighted && "ring-2 ring-primary ring-offset-2"
      )}
      style={{
        gridRow: `${cell.row} / span ${cell.rowSpan}`,
        gridColumn: `${cell.col + 1} / span ${cell.colSpan}`,
      }}
      aria-label={isPrimary ? undefined : env.name}
    >
      {isPrimary && (
        <>
          <span className="flex items-center gap-1">
            <span className={cn("size-2 shrink-0 rounded-full", style.dot)} />
            <span className="truncate text-xs font-semibold">{env.name}</span>
            {state.overdue && (
              <AlertTriangle className="ml-auto size-3 shrink-0 text-red-600" />
            )}
          </span>
          {(env.type || spanBadge || cell.shapeRowSpan > 3) && (
            <span className="truncate text-[0.625rem] uppercase text-muted-foreground">
              {[
                env.type,
                spanBadge ??
                  (cell.shapeRowSpan > 3
                    ? `${cell.shapeRowSpan} andares`
                    : null),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
          <span className="mt-auto text-[0.625rem] font-medium tabular-nums text-muted-foreground">
            {state.total === 0
              ? "sem equip."
              : `${state.installed}/${state.total} equip.`}
          </span>
        </>
      )}
    </button>
  );
}

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
              <Plus className="mr-1.5 size-4" />
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
        {!item.systemId && !item.system && (
          <span
            className="inline-flex items-center gap-1 text-amber-600"
            title="Equipamento sem sistema"
          >
            <AlertTriangle className="size-3 shrink-0" />
            <span className="text-[0.625rem] font-medium uppercase">
              Sem sistema
            </span>
          </span>
        )}
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
