import { useMemo, useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  Boxes,
  Loader2,
  MousePointerClick,
  PackagePlus,
  Plus,
  Search,
  Wind,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { runWithToast } from "@/lib/errors";
import type { SystemOption } from "@/components/engenharia/building-panel/edit-dialogs";

/** Ambiente selecionado na matriz como alvo da atribuição. */
export type AssignTarget = {
  envId: Id<"environments">;
  envName: string;
  floorLabel: string;
};

const NO_SYSTEM_VALUE = "__none__";

const KIND_LABELS: Record<"condensadora" | "evaporadora", string> = {
  condensadora: "Condensadora",
  evaporadora: "Evaporadora",
};

/**
 * Painel lateral com o pool de equipamentos planejados ainda sem ambiente.
 * Fluxo: selecionar um ambiente na matriz → "Atribuir" move o item para lá.
 * Itens sem sistema são permitidos e exibem um ícone de alerta.
 */
export function UnassignedEquipmentPanel({
  projectId,
  systems,
  target,
  onClose,
}: {
  projectId: Id<"projects">;
  systems: SystemOption[];
  target: AssignTarget | null;
  onClose: () => void;
}) {
  const items = useQuery(api.projectEquipment.listUnassigned, { projectId });
  const assign = useMutation(api.projectEquipment.assignToEnvironment);

  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [assigningId, setAssigningId] =
    useState<Id<"projectEquipment"> | null>(null);

  const filtered = useMemo(() => {
    if (!items) return [];
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (i) =>
        i.modelo.toLowerCase().includes(term) ||
        i.capacidade.toLowerCase().includes(term) ||
        i.system.toLowerCase().includes(term) ||
        KIND_LABELS[i.kind].toLowerCase().includes(term)
    );
  }, [items, search]);

  async function handleAssign(itemId: Id<"projectEquipment">) {
    if (!target) return;
    setAssigningId(itemId);
    await runWithToast(
      () => assign({ itemId, environmentId: target.envId }),
      `Equipamento atribuído a ${target.envName}`,
      "Não foi possível atribuir o equipamento"
    );
    setAssigningId(null);
  }

  return (
    <aside className="flex h-full flex-col gap-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        <PackagePlus className="size-4 shrink-0 text-muted-foreground" />
        <h3 className="truncate text-sm font-semibold">
          Equipamentos não atribuídos
        </h3>
        {items !== undefined && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
            {items.length}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-7"
          onClick={onClose}
          aria-label="Fechar painel de equipamentos"
        >
          <X className="size-4" />
        </Button>
      </div>

      {target ? (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-2 text-xs">
          <MousePointerClick className="size-3.5 shrink-0 text-primary" />
          <span className="min-w-0 truncate">
            Atribuir para <span className="font-semibold">{target.envName}</span>
            <span className="text-muted-foreground"> · {target.floorLabel}</span>
          </span>
        </div>
      ) : (
        <p className="rounded-md border border-dashed px-2.5 py-2 text-xs text-muted-foreground">
          Selecione um ambiente no prédio para atribuir os equipamentos.
        </p>
      )}

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8 text-xs"
            placeholder="Buscar modelo, sistema..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          variant={showCreate ? "secondary" : "outline"}
          size="xs"
          onClick={() => setShowCreate((v) => !v)}
        >
          <Plus className="mr-1 size-3.5" />
          Novo
        </Button>
      </div>

      {showCreate && (
        <CreateUnassignedForm
          projectId={projectId}
          systems={systems}
          onDone={() => setShowCreate(false)}
        />
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {items === undefined ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="rounded-lg border border-dashed py-8 text-center text-xs text-muted-foreground">
            {items.length === 0
              ? "Nenhum equipamento aguardando atribuição. Use “Novo” para criar."
              : "Nenhum equipamento corresponde à busca."}
          </p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((item) => (
              <li
                key={item._id}
                className="space-y-1 rounded-lg border bg-background px-2.5 py-2 text-xs"
              >
                <div className="flex items-center gap-1.5">
                  <Wind className="size-3 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">
                    {KIND_LABELS[item.kind]}
                  </span>
                  {item.systemId === null && (
                    <span
                      className="ml-auto inline-flex items-center gap-1 text-amber-600"
                      title="Equipamento sem sistema"
                    >
                      <AlertTriangle className="size-3.5 shrink-0" />
                      <span className="text-[0.625rem] font-medium uppercase">
                        Sem sistema
                      </span>
                    </span>
                  )}
                </div>

                {(item.modelo || item.capacidade || item.serialNumber) && (
                  <div className="flex flex-wrap gap-x-2 text-muted-foreground">
                    {(item.modelo || item.capacidade) && (
                      <span className="truncate">
                        {[item.modelo, item.capacidade]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                    {item.serialNumber && <span>S/N {item.serialNumber}</span>}
                  </div>
                )}

                {item.systemId !== null && item.system && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Boxes className="size-3 shrink-0" />
                    <span className="truncate">{item.system}</span>
                  </div>
                )}

                <div className="pt-1">
                  <Button
                    size="xs"
                    className="h-6 w-full text-xs"
                    disabled={!target || assigningId !== null}
                    onClick={() => void handleAssign(item._id)}
                    title={
                      target
                        ? `Atribuir a ${target.envName}`
                        : "Selecione um ambiente no prédio"
                    }
                  >
                    {assigningId === item._id ? (
                      <Loader2 className="mr-1 size-3 animate-spin" />
                    ) : (
                      <MousePointerClick className="mr-1 size-3" />
                    )}
                    Atribuir
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function CreateUnassignedForm({
  projectId,
  systems,
  onDone,
}: {
  projectId: Id<"projects">;
  systems: SystemOption[];
  onDone: () => void;
}) {
  const create = useMutation(api.projectEquipment.createUnassigned);

  const [systemId, setSystemId] = useState<string>(NO_SYSTEM_VALUE);
  const [kind, setKind] = useState<"condensadora" | "evaporadora">(
    "evaporadora"
  );
  const [modelo, setModelo] = useState("");
  const [capacidade, setCapacidade] = useState("");
  const [saving, setSaving] = useState(false);

  const systemItems: Record<string, string> = {
    [NO_SYSTEM_VALUE]: "Sem sistema",
    ...Object.fromEntries(
      systems.map((s) => [s._id, s.type ? `${s.name} · ${s.type}` : s.name])
    ),
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const ok = await runWithToast(
      () =>
        create({
          projectId,
          systemId:
            systemId === NO_SYSTEM_VALUE
              ? undefined
              : (systemId as Id<"systems">),
          kind,
          modelo: modelo.trim() || undefined,
          capacidade: capacidade.trim() || undefined,
        }),
      "Equipamento criado",
      "Não foi possível criar o equipamento"
    );
    setSaving(false);
    if (ok) {
      setModelo("");
      setCapacidade("");
      onDone();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-2 rounded-md border bg-background p-2.5"
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="pool-system" className="text-xs">
            Sistema
          </Label>
          <Select
            value={systemId}
            items={systemItems}
            onValueChange={(v) => setSystemId(v)}
          >
            <SelectTrigger id="pool-system" className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SYSTEM_VALUE}>Sem sistema</SelectItem>
              {systems.map((s) => (
                <SelectItem key={s._id} value={s._id}>
                  {s.type ? `${s.name} · ${s.type}` : s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tipo</Label>
          <Select
            value={kind}
            items={KIND_LABELS}
            onValueChange={(v) =>
              setKind(v as "condensadora" | "evaporadora")
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="evaporadora">Evaporadora</SelectItem>
              <SelectItem value="condensadora">Condensadora</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="pool-modelo" className="text-xs">
            Modelo
          </Label>
          <Input
            id="pool-modelo"
            className="h-8 text-xs"
            placeholder="Ex: MSZ-GL12"
            value={modelo}
            onChange={(e) => setModelo(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pool-cap" className="text-xs">
            Capacidade
          </Label>
          <Input
            id="pool-cap"
            className="h-8 text-xs"
            placeholder="Ex: 12.000 BTUs"
            value={capacidade}
            onChange={(e) => setCapacidade(e.target.value)}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-0.5">
        <Button type="button" variant="ghost" size="xs" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" size="xs" disabled={saving}>
          {saving ? (
            <Loader2 className="mr-1 size-3 animate-spin" />
          ) : (
            <Plus className="mr-1 size-3" />
          )}
          Criar
        </Button>
      </div>
    </form>
  );
}
