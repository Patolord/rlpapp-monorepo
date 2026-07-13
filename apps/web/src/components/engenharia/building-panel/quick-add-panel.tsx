import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  Boxes,
  Check,
  ChevronsUpDown,
  Copy,
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
import { Checkbox } from "@/components/ui/checkbox";
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
  const [activeSystem, setActiveSystem] = useState<string>(NO_SYSTEM);

  // Sincroniza o sistema pré-ativado quando o painel é aberto por atalho.
  useEffect(() => {
    if (initialSystemId) setActiveSystem(initialSystemId);
  }, [initialSystemId]);

  // Sistema ativo removido/inexistente volta para "Sem sistema".
  useEffect(() => {
    if (
      activeSystem !== NO_SYSTEM &&
      !systems.some((s) => s._id === activeSystem)
    ) {
      setActiveSystem(NO_SYSTEM);
    }
  }, [systems, activeSystem]);

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
            systems={systems}
            activeSystem={activeSystem}
            onActiveSystemChange={setActiveSystem}
            selectedEnvs={selectedEnvs}
          />
        ) : (
          <LinkMode items={pendingLinkItems} hasSelection={selectedEnvIds.size > 0} />
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

/* ── Modo Adicionar ── */

function AddMode({
  projectId,
  systems,
  activeSystem,
  onActiveSystemChange,
  selectedEnvs,
}: {
  projectId: Id<"projects">;
  systems: SystemOption[];
  activeSystem: string;
  onActiveSystemChange: (value: string) => void;
  selectedEnvs: SelectedEnvInfo[];
}) {
  const bulkCreateSystems = useMutation(api.systems.bulkCreateSystems);
  const bulkAdd = useMutation(api.projectEquipment.bulkAddToEnvironments);

  const [systemInput, setSystemInput] = useState("");
  const [creatingSystems, setCreatingSystems] = useState(false);
  const [evapQty, setEvapQty] = useState(1);
  const [condQty, setCondQty] = useState(0);
  const [modelo, setModelo] = useState("");
  const [capacidade, setCapacidade] = useState("");
  const [generateQr, setGenerateQr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastTokens, setLastTokens] = useState<string[]>([]);

  async function handleCreateSystems() {
    const names = systemInput
      .split(/[,;\n]+/)
      .map((n) => n.trim())
      .filter(Boolean);
    if (names.length === 0) return;

    setCreatingSystems(true);
    try {
      const results = await bulkCreateSystems({ projectId, names });
      const created = results.filter((r) => r.created);
      if (created.length > 0) {
        toast.success(
          created.length === 1
            ? `Sistema "${created[0].name}" criado`
            : `${created.length} sistemas criados`
        );
      } else if (results.length > 0) {
        toast.info("Os sistemas informados já existem nesta obra");
      }
      // Ativa o primeiro sistema informado (criado ou já existente).
      if (results.length > 0) onActiveSystemChange(results[0].systemId);
      setSystemInput("");
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Não foi possível criar os sistemas")
      );
    } finally {
      setCreatingSystems(false);
    }
  }

  const totalPerEnv = evapQty + condQty;
  const total = totalPerEnv * selectedEnvs.length;
  const canSubmit = total > 0 && !saving;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const items: {
        kind: "evaporadora" | "condensadora";
        qty: number;
        modelo?: string;
        capacidade?: string;
      }[] = [];
      if (evapQty > 0) {
        items.push({
          kind: "evaporadora",
          qty: evapQty,
          modelo: modelo.trim() || undefined,
          capacidade: capacidade.trim() || undefined,
        });
      }
      if (condQty > 0) {
        items.push({
          kind: "condensadora",
          qty: condQty,
          modelo: modelo.trim() || undefined,
          capacidade: capacidade.trim() || undefined,
        });
      }

      const result = await bulkAdd({
        environmentIds: selectedEnvs.map((e) => e.envId),
        systemId:
          activeSystem === NO_SYSTEM
            ? undefined
            : (activeSystem as Id<"systems">),
        items,
        generateQr,
      });

      const tokens = result.items
        .map((i) => i.token)
        .filter((t): t is string => t !== null);
      setLastTokens(tokens);
      toast.success(
        `${result.created} equipamento${result.created === 1 ? "" : "s"} adicionado${result.created === 1 ? "" : "s"} em ${selectedEnvs.length} ambiente${selectedEnvs.length === 1 ? "" : "s"}${tokens.length > 0 ? ` · ${tokens.length} QRs gerados` : ""}`
      );
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Não foi possível adicionar os equipamentos")
      );
    } finally {
      setSaving(false);
    }
  }

  async function copyTokens() {
    await navigator.clipboard.writeText(lastTokens.join("\n"));
    toast.success("Tokens copiados");
  }

  return (
    <div className="space-y-3">
      {/* Sistemas */}
      <section className="space-y-1.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Boxes className="size-3.5" />
          Sistema
        </span>
        <div className="flex flex-wrap gap-1">
          <SystemChip
            label="Sem sistema"
            active={activeSystem === NO_SYSTEM}
            onClick={() => onActiveSystemChange(NO_SYSTEM)}
          />
          {systems.map((s) => (
            <SystemChip
              key={s._id}
              label={s.type ? `${s.name} · ${s.type}` : s.name}
              active={activeSystem === s._id}
              onClick={() => onActiveSystemChange(s._id)}
            />
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <Input
            className="h-8 text-xs"
            placeholder="Novo sistema… (Enter cria; vírgula separa vários)"
            value={systemInput}
            onChange={(e) => setSystemInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleCreateSystems();
              }
            }}
          />
          <Button
            variant="outline"
            size="icon"
            className="size-8 shrink-0"
            disabled={creatingSystems || !systemInput.trim()}
            onClick={() => void handleCreateSystems()}
            aria-label="Criar sistemas"
          >
            {creatingSystems ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
          </Button>
        </div>
      </section>

      {/* Equipamentos */}
      <section className="space-y-1.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Wind className="size-3.5" />
          Equipamentos por ambiente
        </span>
        <QtyStepper
          label="Evaporadora"
          value={evapQty}
          onChange={setEvapQty}
        />
        <QtyStepper
          label="Condensadora"
          value={condQty}
          onChange={setCondQty}
        />

        <Collapsible>
          <CollapsibleTrigger className="flex w-full items-center gap-1 rounded px-1 py-1 text-xs text-muted-foreground hover:text-foreground">
            <ChevronsUpDown className="size-3" />
            Detalhes (opcional)
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Input
                className="h-8 text-xs"
                placeholder="Modelo"
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
              />
              <Input
                className="h-8 text-xs"
                placeholder="Capacidade"
                value={capacidade}
                onChange={(e) => setCapacidade(e.target.value)}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        <label className="flex cursor-pointer items-center gap-2 rounded-md border bg-background px-2.5 py-2 text-xs">
          <Checkbox
            checked={generateQr}
            onCheckedChange={(checked) => setGenerateQr(checked === true)}
          />
          <QrCode className="size-3.5 text-muted-foreground" />
          Gerar QR automaticamente para cada equipamento
        </label>
      </section>

      <Button
        className="w-full"
        disabled={!canSubmit || selectedEnvs.length === 0}
        onClick={() => void handleSubmit()}
        title={
          selectedEnvs.length === 0
            ? "Selecione ambientes no prédio"
            : undefined
        }
      >
        {saving ? (
          <Loader2 className="mr-1.5 size-4 animate-spin" />
        ) : (
          <Plus className="mr-1.5 size-4" />
        )}
        {selectedEnvs.length === 0
          ? "Selecione ambientes no prédio"
          : `Adicionar ${total} equipamento${total === 1 ? "" : "s"} em ${selectedEnvs.length} ambiente${selectedEnvs.length === 1 ? "" : "s"}`}
      </Button>

      {lastTokens.length > 0 && (
        <div className="space-y-1.5 rounded-md border bg-background p-2.5 text-xs">
          <div className="flex items-center gap-1.5">
            <QrCode className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="font-medium">
              {lastTokens.length} QRs gerados
            </span>
            <Button
              variant="outline"
              size="xs"
              className="ml-auto h-6 px-1.5 text-xs"
              onClick={() => void copyTokens()}
            >
              <Copy className="mr-1 size-3" />
              Copiar tokens
            </Button>
          </div>
          <p className="break-all font-mono text-[0.6875rem] leading-relaxed text-muted-foreground">
            {lastTokens.join("  ")}
          </p>
        </div>
      )}
    </div>
  );
}

function SystemChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background text-foreground hover:border-primary/50 hover:bg-muted"
      )}
    >
      {active && <Check className="size-3 shrink-0" />}
      <span className="truncate">{label}</span>
    </button>
  );
}

function QtyStepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-1.5">
      <span className="text-xs font-medium">{label}</span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="size-7"
          disabled={value <= 0}
          onClick={() => onChange(Math.max(0, value - 1))}
          aria-label={`Diminuir ${label}`}
        >
          <Minus className="size-3.5" />
        </Button>
        <span className="w-8 text-center text-sm font-semibold tabular-nums">
          {value}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="size-7"
          disabled={value >= 99}
          onClick={() => onChange(Math.min(99, value + 1))}
          aria-label={`Aumentar ${label}`}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

/* ── Modo Vincular QRs ── */

function LinkMode({
  items,
  hasSelection,
}: {
  items: PendingLinkItem[];
  hasSelection: boolean;
}) {
  const linkToken = useMutation(api.qrCodes.linkTokenToProjectEquipment);
  // Lotes de etiquetas impressas com tokens ainda livres.
  const batches = useQuery(api.qrCodes.listAvailableBatches, {});

  const [tokenInput, setTokenInput] = useState("");
  const [targetItemId, setTargetItemId] =
    useState<Id<"projectEquipment"> | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Alvo atual: item clicado (se ainda pendente) ou o primeiro da fila.
  const target =
    items.find((i) => i.item._id === targetItemId) ?? items[0] ?? null;

  const selectedBatch =
    batches?.find((b) => b.batchId === selectedBatchId) ??
    batches?.[0] ??
    null;

  async function linkTokenToTarget(token: string) {
    const normalized = token.trim();
    if (!normalized || !target || linking) return;
    setLinking(true);
    setInlineError(null);
    try {
      await linkToken({ token: normalized, itemId: target.item._id });
      toast.success(
        `QR ${normalized.toUpperCase()} vinculado a ${target.envName}`
      );
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
        Selecione ambientes no prédio para listar os equipamentos sem QR.
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <p className="rounded-md border border-dashed px-2.5 py-3 text-center text-xs text-muted-foreground">
        Todos os equipamentos dos ambientes selecionados já têm QR vinculado.
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
          </p>
        )}
      </div>

      {batches !== undefined && batches.length > 0 && (
        <div className="space-y-1.5 rounded-md border bg-background p-2.5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Layers className="size-3.5" />
            Etiquetas disponíveis por lote
          </span>
          <Select
            value={selectedBatch?.batchId ?? null}
            items={Object.fromEntries(
              batches.map((b) => [
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
              {batches.map((b) => (
                <SelectItem key={b.batchId} value={b.batchId}>
                  {b.batchName ?? b.batchId} · {b.availableTokens.length}{" "}
                  livre{b.availableTokens.length === 1 ? "" : "s"}
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
                  disabled={linking || !target}
                  onClick={() => void linkTokenToTarget(token)}
                  title={
                    target
                      ? `Vincular ${token} a ${target.envName}`
                      : "Nenhum equipamento pendente"
                  }
                  className="rounded-full border bg-background px-2 py-0.5 font-mono text-[0.6875rem] transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {token}
                </button>
              ))}
            </div>
          )}
          <p className="text-[0.6875rem] text-muted-foreground">
            Clique em um token para vinculá-lo ao equipamento destacado.
          </p>
        </div>
      )}

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
    </div>
  );
}
