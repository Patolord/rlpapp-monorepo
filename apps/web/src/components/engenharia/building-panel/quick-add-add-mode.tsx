import { useEffect, useMemo, useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import {
  Boxes,
  ChevronsUpDown,
  Loader2,
  Minus,
  Plus,
  X,
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
import { getErrorMessage } from "@/lib/errors";
import type { ProjectHierarchy } from "@/components/engenharia/building-panel/hierarchy";
import {
  flattenEnvironments,
  newLine,
  newSystem,
  SELECTED_ENV,
  suggestSystemName,
  type LineDraft,
  type SystemDraft,
} from "@/components/engenharia/building-panel/quick-add-drafts";
import type { SelectedEnvInfo } from "@/components/engenharia/building-panel/quick-add-selected-envs";
import type { SystemOption } from "@/components/engenharia/building-panel/system-option";

/* ── Modo Adicionar (sistema-first) ── */

export function AddMode({
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
                size="icon-xs"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() =>
                  setDrafts((prev) => prev.filter((d) => d.id !== draft.id))
                }
                aria-label={`Remover sistema ${idx + 1}`}
              >
                <X />
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
                      size="icon-xs"
                      disabled={line.qty <= 0}
                      onClick={() =>
                        updateLine(draft.id, line.id, {
                          qty: Math.max(0, line.qty - 1),
                        })
                      }
                      aria-label="Diminuir quantidade"
                    >
                      <Minus />
                    </Button>
                    <span className="w-7 text-center text-sm font-semibold tabular-nums">
                      {line.qty}
                    </span>
                    <Button
                      variant="outline"
                      size="icon-xs"
                      disabled={line.qty >= 99}
                      onClick={() =>
                        updateLine(draft.id, line.id, {
                          qty: Math.min(99, line.qty + 1),
                        })
                      }
                      aria-label="Aumentar quantidade"
                    >
                      <Plus />
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="ml-auto shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={draft.lines.length <= 1}
                    onClick={() =>
                      updateDraft(draft.id, {
                        lines: draft.lines.filter((l) => l.id !== line.id),
                      })
                    }
                    aria-label="Remover linha"
                  >
                    <X />
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
            <Plus />
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
        <Boxes />
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
          <Loader2 className="animate-spin" />
        ) : (
          <Plus />
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
