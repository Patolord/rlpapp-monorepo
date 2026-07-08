import { useMemo, useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import {
  ExternalLink,
  Link2,
  Loader2,
  Plus,
  Snowflake,
  Trash2,
  Unlink,
  Wind,
} from "lucide-react";

import { LinkEquipmentDialog } from "@/components/engenharia/link-equipment-dialog";
import { StatusBadge } from "@/components/engenharia/status-badge";
import {
  TYPE_LABELS,
  type EquipmentStatus,
  type GridItem,
  type GridUnit,
} from "@/components/engenharia/building";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EQUIPMENT_STATUS_OPTIONS } from "@/lib/equipment-status";
import { runWithToast } from "@/lib/errors";

function toDateInput(ms: number | null): string {
  if (ms === null) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fromDateInput(value: string): number | null {
  if (!value) return null;
  const ms = new Date(`${value}T12:00:00`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function ApartmentPanel({
  projectId,
  unit,
  onClose,
}: {
  projectId: Id<"projects">;
  unit: GridUnit | null;
  onClose: () => void;
}) {
  // Mantém o último apto durante o fade-out.
  const [linkItemId, setLinkItemId] = useState<Id<"projectEquipment"> | null>(
    null
  );

  const setDeadline = useMutation(api.projectUnits.setDeadline);
  const removeUnit = useMutation(api.projectUnits.remove);

  const groups = useMemo(() => {
    if (!unit) return [];
    const bySystem = new Map<string, GridItem[]>();
    for (const item of unit.equipment) {
      const list = bySystem.get(item.system) ?? [];
      list.push(item);
      bySystem.set(item.system, list);
    }
    return Array.from(bySystem.entries());
  }, [unit]);

  async function handleDeadline(value: string) {
    if (!unit) return;
    await runWithToast(
      () => setDeadline({ unitId: unit._id, deadline: fromDateInput(value) }),
      "Prazo atualizado",
      "Não foi possível atualizar o prazo"
    );
  }

  async function handleRemoveUnit() {
    if (!unit) return;
    if (
      !window.confirm(
        `Remover o apartamento ${unit.label} e todos os seus equipamentos?`
      )
    )
      return;
    const ok = await runWithToast(
      () => removeUnit({ unitId: unit._id }),
      "Apartamento removido",
      "Não foi possível remover"
    );
    if (ok) onClose();
  }

  return (
    <Sheet open={unit !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        {unit && (
          <>
            <SheetHeader className="border-b">
              <div className="flex items-center gap-2">
                <SheetTitle className="text-xl font-bold">
                  Apartamento {unit.label}
                </SheetTitle>
                <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold uppercase">
                  {TYPE_LABELS[unit.type]}
                </span>
                {unit.floorSpan > 1 && (
                  <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold">
                    {unit.floorSpan === 2 ? "Duplex" : "Triplex"}
                  </span>
                )}
              </div>
              <SheetDescription>
                {unit.equipment.filter((e) => e.status === "operational").length}
                /{unit.equipment.length} equipamentos instalados
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-5 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="unit-deadline">Prazo de instalação</Label>
                <Input
                  id="unit-deadline"
                  type="date"
                  defaultValue={toDateInput(unit.deadline)}
                  onChange={(e) => handleDeadline(e.target.value)}
                />
              </div>

              {groups.length === 0 ? (
                <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
                  Nenhum equipamento neste apartamento ainda.
                </p>
              ) : (
                groups.map(([system, items]) => (
                  <div key={system} className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      {system}
                    </h3>
                    <div className="space-y-2">
                      {items.map((item) => (
                        <ItemRow
                          key={item._id}
                          item={item}
                          onLink={() => setLinkItemId(item._id)}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}

              <AddItemForm projectId={projectId} unit={unit} />

              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground hover:text-destructive"
                onClick={handleRemoveUnit}
              >
                <Trash2 className="mr-1.5 size-4" />
                Remover apartamento
              </Button>
            </div>
          </>
        )}
      </SheetContent>

      <LinkEquipmentDialog
        itemId={linkItemId}
        onClose={() => setLinkItemId(null)}
      />
    </Sheet>
  );
}

function ItemRow({
  item,
  onLink,
}: {
  item: GridItem;
  onLink: () => void;
}) {
  const setStatus = useMutation(api.projectEquipment.setStatus);
  const unlink = useMutation(api.projectEquipment.unlinkEquipment);
  const remove = useMutation(api.projectEquipment.remove);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, ok: string, err: string) {
    setBusy(true);
    await runWithToast(action, ok, err);
    setBusy(false);
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-medium">
            {item.kind === "condensadora" ? (
              <Snowflake className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <Wind className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate">{item.ambiente}</span>
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {[item.modelo, item.capacidade].filter(Boolean).join(" · ") ||
              "Sem modelo definido"}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          aria-label="Remover equipamento"
          onClick={() =>
            run(
              () => remove({ itemId: item._id }),
              "Equipamento removido",
              "Não foi possível remover"
            )
          }
          className="shrink-0 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Select
          value={item.status}
          onValueChange={(v) =>
            run(
              () => setStatus({ itemId: item._id, status: v as EquipmentStatus }),
              "Status atualizado",
              "Não foi possível atualizar"
            )
          }
        >
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EQUIPMENT_STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {item.linkedEquipmentId ? (
          <div className="flex items-center gap-1">
            {item.token && (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                render={<Link to="/q/$token" params={{ token: item.token }} />}
              >
                <ExternalLink className="mr-1 size-3.5" />
                {item.token}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-muted-foreground"
              disabled={busy}
              onClick={() =>
                run(
                  () => unlink({ itemId: item._id }),
                  "Equipamento desvinculado",
                  "Não foi possível desvincular"
                )
              }
            >
              <Unlink className="size-3.5" />
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={busy}
            onClick={onLink}
          >
            <Link2 className="mr-1 size-3.5" />
            Vincular QR
          </Button>
        )}
      </div>
    </div>
  );
}

function AddItemForm({
  projectId,
  unit,
}: {
  projectId: Id<"projects">;
  unit: GridUnit;
}) {
  const upsert = useMutation(api.projectEquipment.upsert);
  const [open, setOpen] = useState(false);
  const [system, setSystem] = useState("");
  const [ambiente, setAmbiente] = useState("");
  const [kind, setKind] = useState<"condensadora" | "evaporadora">(
    "evaporadora"
  );
  const [modelo, setModelo] = useState("");
  const [capacidade, setCapacidade] = useState("");
  const [saving, setSaving] = useState(false);

  // Sugestões de sistema a partir dos já existentes no apto.
  const systems = Array.from(new Set(unit.equipment.map((e) => e.system)));

  async function handleAdd() {
    if (!ambiente.trim()) return;
    setSaving(true);
    const ok = await runWithToast(
      () =>
        upsert({
          projectId,
          unitId: unit._id,
          system: system.trim() || systems[0] || "Split",
          ambiente: ambiente.trim(),
          kind,
          modelo: modelo.trim() || undefined,
          capacidade: capacidade.trim() || undefined,
        }),
      "Equipamento adicionado",
      "Não foi possível adicionar"
    );
    setSaving(false);
    if (ok) {
      setAmbiente("");
      setModelo("");
      setCapacidade("");
    }
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => setOpen(true)}
      >
        <Plus className="mr-1.5 size-4" />
        Adicionar equipamento
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Sistema</Label>
          <Input
            list="systems-suggestions"
            value={system}
            onChange={(e) => setSystem(e.target.value)}
            placeholder={systems[0] ?? "VRF 1 / Split"}
          />
          <datalist id="systems-suggestions">
            {systems.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tipo</Label>
          <Select
            value={kind}
            onValueChange={(v) =>
              setKind(v as "condensadora" | "evaporadora")
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="evaporadora">Evaporadora</SelectItem>
              <SelectItem value="condensadora">Condensadora</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Ambiente</Label>
        <Input
          value={ambiente}
          onChange={(e) => setAmbiente(e.target.value)}
          placeholder="Ex: Sala de Estar"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Modelo</Label>
          <Input
            value={modelo}
            onChange={(e) => setModelo(e.target.value)}
            placeholder="Ex: AM045TN"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Capacidade</Label>
          <Input
            value={capacidade}
            onChange={(e) => setCapacidade(e.target.value)}
            placeholder="Ex: 15.000 BTU/h"
          />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => setOpen(false)}
        >
          Fechar
        </Button>
        <Button
          size="sm"
          className="flex-1"
          disabled={saving || !ambiente.trim()}
          onClick={handleAdd}
        >
          {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
          Adicionar
        </Button>
      </div>
    </div>
  );
}
