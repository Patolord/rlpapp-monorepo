import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  Boxes,
  ChevronsUpDown,
  Layers,
  Loader2,
  Minus,
  MousePointerClick,
  Plus,
  QrCode,
  ScanLine,
  Wind,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";
import type { SystemOption } from "@/components/engenharia/building-panel/edit-dialogs";
import type {
  HierarchyItem,
  ProjectHierarchy,
} from "@/components/engenharia/building-panel/hierarchy";

/** Valor sentinela do chip "Sem sistema". */
const NO_SYSTEM = "__none__";

type PanelMode = "add" | "link";

type SelectedEnvInfo = {
  envId: Id<"environments">;
  name: string;
  floorLabel: string;
  towerName: string;
};

type PendingLinkItem = {
  item: HierarchyItem;
  envName: string;
  floorLabel: string;
};

/** Ambientes selecionados resolvidos a partir da hierarquia reativa. */
function resolveSelectedEnvs(
  hierarchy: ProjectHierarchy | null | undefined,
  selectedEnvIds: ReadonlySet<string>
): SelectedEnvInfo[] {
  if (!hierarchy) return [];
  const result: SelectedEnvInfo[] = [];
  for (const tower of hierarchy.towers) {
    for (const floor of tower.floors) {
      for (const env of floor.environments) {
        if (selectedEnvIds.has(env._id)) {
          result.push({
            envId: env._id,
            name: env.name,
            floorLabel: floor.label,
            towerName: tower.name,
          });
        }
      }
    }
  }
  return result;
}

/** Equipamentos dos ambientes selecionados ainda sem QR vinculado. */
function resolvePendingLinkItems(
  hierarchy: ProjectHierarchy | null | undefined,
  selectedEnvIds: ReadonlySet<string>
): PendingLinkItem[] {
  if (!hierarchy) return [];
  const result: PendingLinkItem[] = [];
  for (const tower of hierarchy.towers) {
    for (const floor of tower.floors) {
      for (const env of floor.environments) {
        if (!selectedEnvIds.has(env._id)) continue;
        for (const item of env.equipment) {
          if (item.token || item.linkedEquipmentId) continue;
          result.push({
            item,
            envName: env.name,
            floorLabel: floor.label,
          });
        }
      }
    }
  }
  return result;
}

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
          size="icon"
          className="ml-auto size-7"
          onClick={onClose}
          aria-label="Fechar cadastro rápido"
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="inline-flex rounded-md border bg-background p-0.5">
        <Button
          variant={mode === "add" ? "secondary" : "ghost"}
          size="xs"
          className="flex-1"
          onClick={() => setMode("add")}
        >
          <Plus className="mr-1 size-3.5" />
          Adicionar
        </Button>
        <Button
          variant={mode === "link" ? "secondary" : "ghost"}
          size="xs"
          className="flex-1"
          onClick={() => setMode("link")}
        >
          <ScanLine className="mr-1 size-3.5" />
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

/* ── Ambientes selecionados ── */

function SelectedEnvChips({
  envs,
  multiTower,
  onDeselectEnv,
  onClearSelection,
}: {
  envs: SelectedEnvInfo[];
  multiTower: boolean;
  onDeselectEnv: (envId: Id<"environments">) => void;
  onClearSelection: () => void;
}) {
  if (envs.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-md border border-dashed px-2.5 py-2 text-xs text-muted-foreground">
        <MousePointerClick className="size-3.5 shrink-0" />
        Clique nas células do prédio para selecionar os ambientes (o rótulo do
        andar seleciona o andar inteiro).
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {envs.length === 1
            ? "1 ambiente selecionado"
            : `${envs.length} ambientes selecionados`}
        </span>
        <Button
          variant="ghost"
          size="xs"
          className="h-6 px-1.5 text-xs text-muted-foreground"
          onClick={onClearSelection}
        >
          Limpar
        </Button>
      </div>
      <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
        {envs.map((env) => (
          <span
            key={env.envId}
            className="inline-flex max-w-full items-center gap-1 rounded-full border bg-background py-0.5 pl-2 pr-1 text-xs"
            title={`${multiTower ? `${env.towerName} · ` : ""}${env.floorLabel} · ${env.name}`}
          >
            <span className="truncate">
              {env.name}
              <span className="text-muted-foreground"> · {env.floorLabel}</span>
            </span>
            <button
              type="button"
              onClick={() => onDeselectEnv(env.envId)}
              className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`Remover ${env.name}`}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Modo Adicionar (sistema-first) ── */

/** Valor sentinela: a linha vale para cada ambiente selecionado no prédio. */
const SELECTED_ENV = "__selected__";

type LineDraft = {
  id: number;
  kind: "condensadora" | "evaporadora";
  qty: number;
  /** SELECTED_ENV ou o id de um ambiente específico (ex: cobertura). */
  envId: string;
  modelo: string;
  capacidade: string;
};

type SystemDraft = {
  id: number;
  name: string;
  lines: LineDraft[];
};

let draftSeq = 0;

function newLine(patch?: Partial<LineDraft>): LineDraft {
  return {
    id: ++draftSeq,
    kind: "evaporadora",
    qty: 1,
    envId: SELECTED_ENV,
    modelo: "",
    capacidade: "",
    ...patch,
  };
}

/** Sistema padrão do exemplo típico: 1 condensadora + N evaporadoras. */
function newSystem(name: string): SystemDraft {
  return {
    id: ++draftSeq,
    name,
    lines: [
      newLine({ kind: "condensadora", qty: 1 }),
      newLine({ kind: "evaporadora", qty: 1 }),
    ],
  };
}

/** Sugere o próximo nome livre "VRF n" considerando existentes e rascunhos. */
function suggestSystemName(existing: string[], drafts: SystemDraft[]): string {
  const taken = new Set([
    ...existing.map((n) => n.toLowerCase()),
    ...drafts.map((d) => d.name.toLowerCase()),
  ]);
  for (let n = 1; ; n++) {
    const candidate = `VRF ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/** Opções de ambiente para as linhas (todos os ambientes da hierarquia). */
function flattenEnvironments(
  hierarchy: ProjectHierarchy | null | undefined
): { envId: string; label: string }[] {
  if (!hierarchy) return [];
  const multiTower = hierarchy.towers.length > 1;
  const result: { envId: string; label: string }[] = [];
  for (const tower of hierarchy.towers) {
    const floors = tower.floors.slice().sort((a, b) => b.number - a.number);
    for (const floor of floors) {
      for (const env of floor.environments) {
        result.push({
          envId: env._id,
          label: `${env.name} · ${floor.label}${multiTower ? ` · ${tower.name}` : ""}`,
        });
      }
    }
  }
  return result;
}

function AddMode({
  projectId,
  hierarchy,
  systems,
  initialSystemId,
  selectedEnvs,
}: {
  projectId: Id<"projects">;
  hierarchy: ProjectHierarchy | null | undefined;
  systems: SystemOption[];
  initialSystemId: Id<"systems"> | null;
  selectedEnvs: SelectedEnvInfo[];
}) {
  const createSystemsWithEquipment = useMutation(
    api.systems.createSystemsWithEquipment
  );

  const [drafts, setDrafts] = useState<SystemDraft[]>(() => {
    const initial = initialSystemId
      ? systems.find((s) => s._id === initialSystemId)
      : undefined;
    return [
      newSystem(
        initial?.name ?? suggestSystemName(systems.map((s) => s.name), [])
      ),
    ];
  });
  const [saving, setSaving] = useState(false);

  // Atalho "Equipamento" de um grupo de sistema: pré-preenche o primeiro
  // bloco com o sistema existente (o submit adiciona a ele, sem duplicar).
  useEffect(() => {
    if (!initialSystemId) return;
    const system = systems.find((s) => s._id === initialSystemId);
    if (!system) return;
    setDrafts((prev) =>
      prev.length === 1 && prev[0].name !== system.name
        ? [{ ...prev[0], name: system.name }]
        : prev
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSystemId]);

  const envOptions = useMemo(() => flattenEnvironments(hierarchy), [hierarchy]);
  const envItems = useMemo(
    () => ({
      [SELECTED_ENV]:
        selectedEnvs.length > 1
          ? "Cada ambiente selecionado"
          : "Ambiente selecionado",
      ...Object.fromEntries(envOptions.map((o) => [o.envId, o.label])),
    }),
    [envOptions, selectedEnvs.length]
  );

  function updateDraft(id: number, patch: Partial<SystemDraft>) {
    setDrafts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...patch } : d))
    );
  }

  function updateLine(
    draftId: number,
    lineId: number,
    patch: Partial<LineDraft>
  ) {
    setDrafts((prev) =>
      prev.map((d) =>
        d.id === draftId
          ? {
              ...d,
              lines: d.lines.map((l) =>
                l.id === lineId ? { ...l, ...patch } : l
              ),
            }
          : d
      )
    );
  }

  // Alguma linha usa o sentinela "ambiente selecionado"?
  const usesSelection = drafts.some((d) =>
    d.lines.some((l) => l.envId === SELECTED_ENV)
  );
  const needsSelection = usesSelection && selectedEnvs.length === 0;

  // Multiplicador: linhas com sentinela replicam o sistema por ambiente.
  const perSystemQty = (d: SystemDraft) =>
    d.lines.reduce((sum, l) => sum + l.qty, 0);
  const total = drafts.reduce((sum, d) => {
    const replicas =
      d.lines.some((l) => l.envId === SELECTED_ENV) && selectedEnvs.length > 1
        ? selectedEnvs.length
        : 1;
    return sum + perSystemQty(d) * replicas;
  }, 0);
  const canSubmit = total > 0 && !needsSelection && !saving;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const existingByName = new Map(
        systems.map((s) => [s.name.toLowerCase(), s._id])
      );

      type Spec = {
        systemId?: Id<"systems">;
        name?: string;
        lines: {
          kind: "condensadora" | "evaporadora";
          qty: number;
          environmentId: Id<"environments">;
          modelo?: string;
          capacidade?: string;
        }[];
      };
      const specs: Spec[] = [];

      for (const draft of drafts) {
        const baseName = draft.name.trim();
        const hasSentinel = draft.lines.some((l) => l.envId === SELECTED_ENV);
        // Sistema replicado por ambiente selecionado (ex: um split por final).
        const replicas =
          hasSentinel && selectedEnvs.length > 1 ? selectedEnvs : [null];

        for (const replicaEnv of replicas) {
          const name =
            replicaEnv && baseName
              ? `${baseName} · ${replicaEnv.name}`
              : baseName;
          const lines = draft.lines
            .filter((l) => l.qty > 0)
            .map((l) => ({
              kind: l.kind,
              qty: l.qty,
              environmentId: (l.envId === SELECTED_ENV
                ? (replicaEnv ?? selectedEnvs[0]).envId
                : l.envId) as Id<"environments">,
              modelo: l.modelo.trim() || undefined,
              capacidade: l.capacidade.trim() || undefined,
            }));
          if (lines.length === 0) continue;

          const existingId = name
            ? existingByName.get(name.toLowerCase())
            : undefined;
          specs.push(
            existingId
              ? { systemId: existingId, lines }
              : { name: name || undefined, lines }
          );
        }
      }

      const result = await createSystemsWithEquipment({
        projectId,
        systems: specs,
      });
      toast.success(
        `${result.itemsCreated} equipamento${result.itemsCreated === 1 ? "" : "s"} em ${result.systemsCreated} sistema${result.systemsCreated === 1 ? "" : "s"} criado${result.systemsCreated === 1 ? "" : "s"}`
      );
      setDrafts([
        newSystem(
          suggestSystemName(
            [...systems.map((s) => s.name), ...specs.map((s) => s.name ?? "")],
            []
          )
        ),
      ]);
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Não foi possível criar os sistemas")
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {drafts.map((draft, idx) => (
        <section
          key={draft.id}
          className="space-y-2 rounded-md border bg-background p-2.5"
        >
          <div className="flex items-center gap-1.5">
            <Boxes className="size-3.5 shrink-0 text-muted-foreground" />
            <Input
              className="h-8 flex-1 text-xs font-medium"
              placeholder="Nome do sistema (vazio = sem sistema)"
              value={draft.name}
              onChange={(e) => updateDraft(draft.id, { name: e.target.value })}
            />
            {drafts.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() =>
                  setDrafts((prev) => prev.filter((d) => d.id !== draft.id))
                }
                aria-label={`Remover sistema ${idx + 1}`}
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>

          <div className="space-y-1.5">
            {draft.lines.map((line) => (
              <div
                key={line.id}
                className="space-y-1.5 rounded-md border bg-muted/30 p-2"
              >
                <div className="flex items-center gap-1.5">
                  <Select
                    value={line.kind}
                    items={{
                      evaporadora: "Evap.",
                      condensadora: "Cond.",
                    }}
                    onValueChange={(v) =>
                      updateLine(draft.id, line.id, {
                        kind: v as "condensadora" | "evaporadora",
                      })
                    }
                  >
                    <SelectTrigger className="h-7 w-20 shrink-0 bg-background text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="evaporadora">Evaporadora</SelectItem>
                      <SelectItem value="condensadora">Condensadora</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-7"
                      disabled={line.qty <= 0}
                      onClick={() =>
                        updateLine(draft.id, line.id, {
                          qty: Math.max(0, line.qty - 1),
                        })
                      }
                      aria-label="Diminuir quantidade"
                    >
                      <Minus className="size-3" />
                    </Button>
                    <span className="w-7 text-center text-sm font-semibold tabular-nums">
                      {line.qty}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-7"
                      disabled={line.qty >= 99}
                      onClick={() =>
                        updateLine(draft.id, line.id, {
                          qty: Math.min(99, line.qty + 1),
                        })
                      }
                      aria-label="Aumentar quantidade"
                    >
                      <Plus className="size-3" />
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto size-6 shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={draft.lines.length <= 1}
                    onClick={() =>
                      updateDraft(draft.id, {
                        lines: draft.lines.filter((l) => l.id !== line.id),
                      })
                    }
                    aria-label="Remover linha"
                  >
                    <X className="size-3" />
                  </Button>
                </div>
                {/* Ambiente da linha (condensadora pode ficar em outro, ex: cobertura). */}
                <Select
                  value={line.envId}
                  items={envItems}
                  onValueChange={(v) =>
                    updateLine(draft.id, line.id, { envId: v })
                  }
                >
                  <SelectTrigger className="h-7 w-full bg-background text-xs">
                    <SelectValue placeholder="Ambiente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECTED_ENV}>
                      {envItems[SELECTED_ENV]}
                    </SelectItem>
                    {envOptions.map((o) => (
                      <SelectItem key={o.envId} value={o.envId}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Collapsible>
                  <CollapsibleTrigger className="flex w-full items-center gap-1 rounded px-0.5 py-0.5 text-[0.6875rem] text-muted-foreground hover:text-foreground">
                    <ChevronsUpDown className="size-3" />
                    Modelo/capacidade
                    {(line.modelo || line.capacidade) && (
                      <span className="truncate font-medium text-foreground">
                        · {[line.modelo, line.capacidade].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="grid grid-cols-2 gap-1.5 pt-1">
                      <Input
                        className="h-7 bg-background text-xs"
                        placeholder="Modelo"
                        value={line.modelo}
                        onChange={(e) =>
                          updateLine(draft.id, line.id, {
                            modelo: e.target.value,
                          })
                        }
                      />
                      <Input
                        className="h-7 bg-background text-xs"
                        placeholder="Capacidade"
                        value={line.capacidade}
                        onChange={(e) =>
                          updateLine(draft.id, line.id, {
                            capacidade: e.target.value,
                          })
                        }
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            size="xs"
            className="w-full"
            onClick={() =>
              updateDraft(draft.id, { lines: [...draft.lines, newLine()] })
            }
          >
            <Plus className="mr-1 size-3" />
            Linha de equipamento
          </Button>
        </section>
      ))}

      <Button
        variant="outline"
        size="xs"
        className="w-full"
        onClick={() =>
          setDrafts((prev) => [
            ...prev,
            newSystem(
              suggestSystemName(
                systems.map((s) => s.name),
                prev
              )
            ),
          ])
        }
      >
        <Boxes className="mr-1 size-3.5" />
        Adicionar sistema
      </Button>

      {selectedEnvs.length > 1 && usesSelection && (
        <p className="rounded-md border bg-muted/40 px-2.5 py-2 text-[0.6875rem] leading-snug text-muted-foreground">
          {selectedEnvs.length} ambientes selecionados: cada sistema será
          criado uma vez por ambiente (nome ganha o sufixo do ambiente).
        </p>
      )}

      <Button
        className="w-full"
        disabled={!canSubmit}
        onClick={() => void handleSubmit()}
        title={
          needsSelection ? "Selecione ambientes no prédio" : undefined
        }
      >
        {saving ? (
          <Loader2 className="mr-1.5 size-4 animate-spin" />
        ) : (
          <Plus className="mr-1.5 size-4" />
        )}
        {needsSelection
          ? "Selecione ambientes no prédio"
          : `Criar ${total} equipamento${total === 1 ? "" : "s"}`}
      </Button>

      <p className="text-[0.6875rem] leading-snug text-muted-foreground">
        Os QRs são vinculados na obra (bipagem do técnico) ou no modo
        "Vincular QRs". "Gerar QR" por item continua disponível no detalhe do
        ambiente.
      </p>
    </div>
  );
}

/* ── Modo Vincular QRs ── */

function LinkMode({
  projectId,
  systems,
  selectedEnvs,
  items,
  hasSelection,
}: {
  projectId: Id<"projects">;
  systems: SystemOption[];
  selectedEnvs: SelectedEnvInfo[];
  items: PendingLinkItem[];
  hasSelection: boolean;
}) {
  const linkToken = useMutation(api.qrCodes.linkTokenToProjectEquipment);
  const createFromRegistered = useMutation(
    api.projectEquipment.createFromRegisteredEquipment
  );
  // Lotes de etiquetas impressas com tokens ainda livres.
  const batches = useQuery(api.qrCodes.listAvailableBatches, {});
  // Fila de atribuição: equipamentos já cadastrados pelo técnico e destinados
  // a esta obra (via lote), ainda sem item planejado.
  const registered = useQuery(api.qrCodes.listRegisteredForProject, {
    projectId,
  });

  const [tokenInput, setTokenInput] = useState("");
  const [targetItemId, setTargetItemId] =
    useState<Id<"projectEquipment"> | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  // Criação inline: usados quando não há item planejado pendente no ambiente.
  const [createKind, setCreateKind] = useState<"evaporadora" | "condensadora">(
    "evaporadora"
  );
  const [createSystemId, setCreateSystemId] = useState<string>(NO_SYSTEM);
  const [createEnvId, setCreateEnvId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Alvo atual: item clicado (se ainda pendente) ou o primeiro da fila.
  const target =
    items.find((i) => i.item._id === targetItemId) ?? items[0] ?? null;
  // Sem item pendente: a bipagem cria o item planejado neste ambiente.
  const createEnv =
    selectedEnvs.find((e) => e.envId === createEnvId) ??
    selectedEnvs[0] ??
    null;
  const willCreate = !target && createEnv !== null;

  // Só lotes sem destino ou destinados a esta obra.
  const visibleBatches = useMemo(
    () =>
      (batches ?? []).filter(
        (b) => !b.projectId || b.projectId === projectId
      ),
    [batches, projectId]
  );
  const selectedBatch =
    visibleBatches.find((b) => b.batchId === selectedBatchId) ??
    visibleBatches[0] ??
    null;

  async function linkTokenToTarget(token: string) {
    const normalized = token.trim();
    if (!normalized || linking) return;
    setLinking(true);
    setInlineError(null);
    try {
      if (target) {
        await linkToken({ token: normalized, itemId: target.item._id });
        toast.success(
          `QR ${normalized.toUpperCase()} vinculado a ${target.envName}`
        );
      } else if (createEnv) {
        await createFromRegistered({
          token: normalized,
          environmentId: createEnv.envId,
          systemId:
            createSystemId === NO_SYSTEM
              ? undefined
              : (createSystemId as Id<"systems">),
          kind: createKind,
        });
        toast.success(
          `QR ${normalized.toUpperCase()} atribuído a ${createEnv.name} (item criado)`
        );
      } else {
        return;
      }
      setTokenInput("");
      setTargetItemId(null);
    } catch (error) {
      setInlineError(getErrorMessage(error, "Não foi possível vincular o QR"));
    } finally {
      setLinking(false);
      inputRef.current?.focus();
    }
  }

  if (!hasSelection) {
    return (
      <p className="flex items-center gap-2 rounded-md border border-dashed px-2.5 py-3 text-xs text-muted-foreground">
        <MousePointerClick className="size-3.5 shrink-0" />
        Selecione ambientes no prédio para vincular ou atribuir etiquetas.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <div className="relative">
          <ScanLine className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            className="h-9 pl-8 font-mono text-sm uppercase"
            placeholder="Bipe ou digite o token"
            value={tokenInput}
            autoFocus
            disabled={linking}
            onChange={(e) => {
              setTokenInput(e.target.value);
              if (inlineError) setInlineError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void linkTokenToTarget(tokenInput);
              }
            }}
          />
        </div>
        {inlineError && (
          <p className="text-xs font-medium text-destructive">{inlineError}</p>
        )}
        {target && (
          <p className="text-xs text-muted-foreground">
            Enter vincula ao destacado:{" "}
            <span className="font-medium text-foreground">
              {target.envName}
            </span>{" "}
            · {target.item.kind === "condensadora" ? "Cond." : "Evap."}
            <br />
            Aceita etiquetas livres ou já cadastradas pelo técnico.
          </p>
        )}
      </div>

      {/* Sem item planejado pendente: bipar cria o item no ambiente. */}
      {willCreate && (
        <div className="space-y-1.5 rounded-md border border-primary/30 bg-primary/5 p-2.5">
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <Plus className="size-3.5" />
            Bipar cria o item planejado no ambiente
          </span>
          {selectedEnvs.length > 1 && (
            <Select
              value={createEnv?.envId ?? null}
              items={Object.fromEntries(
                selectedEnvs.map((e) => [
                  e.envId,
                  `${e.name} · ${e.floorLabel}`,
                ])
              )}
              onValueChange={(v) => setCreateEnvId(v)}
            >
              <SelectTrigger className="h-8 bg-background text-xs">
                <SelectValue placeholder="Ambiente" />
              </SelectTrigger>
              <SelectContent>
                {selectedEnvs.map((e) => (
                  <SelectItem key={e.envId} value={e.envId}>
                    {e.name} · {e.floorLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            <Select
              value={createKind}
              items={{
                evaporadora: "Evaporadora",
                condensadora: "Condensadora",
              }}
              onValueChange={(v) =>
                setCreateKind(v as "evaporadora" | "condensadora")
              }
            >
              <SelectTrigger className="h-8 bg-background text-xs">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="evaporadora">Evaporadora</SelectItem>
                <SelectItem value="condensadora">Condensadora</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={createSystemId}
              items={{
                [NO_SYSTEM]: "Sem sistema",
                ...Object.fromEntries(systems.map((s) => [s._id, s.name])),
              }}
              onValueChange={(v) => setCreateSystemId(v)}
            >
              <SelectTrigger className="h-8 bg-background text-xs">
                <SelectValue placeholder="Sistema" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SYSTEM}>Sem sistema</SelectItem>
                {systems.map((s) => (
                  <SelectItem key={s._id} value={s._id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-[0.6875rem] text-muted-foreground">
            A etiqueta bipada (livre ou já cadastrada pelo técnico) cria o
            equipamento em{" "}
            <span className="font-medium text-foreground">
              {createEnv?.name}
            </span>{" "}
            e vincula na hora.
          </p>
        </div>
      )}

      {/* Fila de atribuição: cadastros do técnico aguardando ambiente. */}
      {registered !== undefined && registered.length > 0 && (
        <div className="space-y-1.5 rounded-md border bg-background p-2.5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <QrCode className="size-3.5" />
            Cadastrados aguardando atribuição ({registered.length})
          </span>
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {registered.map((entry) => (
              <li key={entry.qrId}>
                <button
                  type="button"
                  disabled={linking || (!target && !createEnv)}
                  onClick={() => void linkTokenToTarget(entry.token)}
                  title={
                    target
                      ? `Vincular ${entry.token} a ${target.envName}`
                      : createEnv
                        ? `Criar item em ${createEnv.name} com ${entry.token}`
                        : "Selecione um destino"
                  }
                  className="flex w-full items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-left text-xs transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {entry.photoUrl ? (
                    <img
                      src={entry.photoUrl}
                      alt=""
                      className="size-8 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span className="flex size-8 shrink-0 items-center justify-center rounded bg-muted">
                      <QrCode className="size-3.5 text-muted-foreground" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono font-semibold">
                      {entry.token}
                    </span>
                    <span className="block truncate text-muted-foreground">
                      {entry.description ?? "Sem descrição"}
                      {entry.batchName ? ` · ${entry.batchName}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-[0.6875rem] text-muted-foreground">
            Cadastros feitos pelo técnico. Clique para vincular ao destino
            atual.
          </p>
        </div>
      )}

      {visibleBatches.length > 0 && (
        <div className="space-y-1.5 rounded-md border bg-background p-2.5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Layers className="size-3.5" />
            Etiquetas livres por lote
          </span>
          <Select
            value={selectedBatch?.batchId ?? null}
            items={Object.fromEntries(
              visibleBatches.map((b) => [
                b.batchId,
                `${b.batchName ?? b.batchId} · ${b.availableTokens.length} livre${b.availableTokens.length === 1 ? "" : "s"}`,
              ])
            )}
            onValueChange={(v) => setSelectedBatchId(v)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Escolha o lote" />
            </SelectTrigger>
            <SelectContent>
              {visibleBatches.map((b) => (
                <SelectItem key={b.batchId} value={b.batchId}>
                  {b.batchName ?? b.batchId} · {b.availableTokens.length}{" "}
                  livre{b.availableTokens.length === 1 ? "" : "s"}
                  {b.projectName ? ` · Obra: ${b.projectName}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedBatch && (
            <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto pt-0.5">
              {selectedBatch.availableTokens.map((token) => (
                <button
                  key={token}
                  type="button"
                  disabled={linking || (!target && !createEnv)}
                  onClick={() => void linkTokenToTarget(token)}
                  title={
                    target
                      ? `Vincular ${token} a ${target.envName}`
                      : createEnv
                        ? `Criar item em ${createEnv.name} com ${token}`
                        : "Selecione um destino"
                  }
                  className="rounded-full border bg-background px-2 py-0.5 font-mono text-[0.6875rem] transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {token}
                </button>
              ))}
            </div>
          )}
          <p className="text-[0.6875rem] text-muted-foreground">
            Clique em um token para vinculá-lo ao destino atual.
          </p>
        </div>
      )}

      {items.length === 0 ? (
        <p className="rounded-md border border-dashed px-2.5 py-3 text-center text-xs text-muted-foreground">
          Nenhum equipamento pendente nos ambientes selecionados — bipar cria o
          item planejado direto no ambiente.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map(({ item, envName, floorLabel }) => {
            const isTarget = target?.item._id === item._id;
            return (
              <li key={item._id}>
                <button
                  type="button"
                  onClick={() => {
                    setTargetItemId(item._id);
                    inputRef.current?.focus();
                  }}
                  className={cn(
                    "w-full space-y-0.5 rounded-md border bg-background px-2.5 py-1.5 text-left text-xs transition-colors",
                    isTarget
                      ? "border-primary ring-1 ring-primary"
                      : "hover:border-primary/40"
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <Wind className="size-3 shrink-0 text-muted-foreground" />
                    <span className="font-medium">
                      {item.kind === "condensadora"
                        ? "Condensadora"
                        : "Evaporadora"}
                    </span>
                    {isTarget && (
                      <span className="ml-auto rounded-full bg-primary/10 px-1.5 py-0.5 text-[0.625rem] font-medium uppercase text-primary">
                        Próximo
                      </span>
                    )}
                  </div>
                  <p className="truncate text-muted-foreground">
                    {envName} · {floorLabel}
                    {item.system ? ` · ${item.system}` : ""}
                    {item.modelo ? ` · ${item.modelo}` : ""}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
