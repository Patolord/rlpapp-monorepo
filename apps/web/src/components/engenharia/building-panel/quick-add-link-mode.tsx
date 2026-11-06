import { useMemo, useRef, useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  Layers,
  MousePointerClick,
  Plus,
  QrCode,
  ScanLine,
  Wind,
} from "lucide-react";
import { toast } from "sonner";

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
import type {
  HierarchyItem,
  ProjectHierarchy,
} from "@/components/engenharia/building-panel/hierarchy";
import type { SelectedEnvInfo } from "@/components/engenharia/building-panel/quick-add-selected-envs";
import type { SystemOption } from "@/components/engenharia/building-panel/system-option";

/* ── Modo Vincular QRs ── */

/** Valor sentinela do chip "Sem sistema". */
const NO_SYSTEM = "__none__";

export type PendingLinkItem = {
  item: HierarchyItem;
  envName: string;
  floorLabel: string;
};

/** Equipamentos dos ambientes selecionados ainda sem QR vinculado. */
export function resolvePendingLinkItems(
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

export function LinkMode({
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
