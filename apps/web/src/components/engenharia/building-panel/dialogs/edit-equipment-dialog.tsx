import { useEffect, useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { HierarchyItem } from "@/components/engenharia/building-panel/hierarchy";
import type { SystemOption } from "@/components/engenharia/building-panel/system-option";

function toTimestamp(value: string): number | undefined {
  if (!value) return undefined;
  const ts = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(ts) ? ts : undefined;
}

/** Valor sentinela do Select para equipamento sem sistema. */
const NO_SYSTEM_VALUE = "__no_system__";

function systemLabel(s: SystemOption): string {
  return s.type ? `${s.name} · ${s.type}` : s.name;
}

function SystemSelect({
  id,
  systems,
  value,
  onChange,
  allowNone = false,
}: {
  id?: string;
  systems: SystemOption[];
  value: Id<"systems"> | null;
  onChange: (systemId: Id<"systems"> | null) => void;
  /** Permite escolher "Sem sistema" (equipamento fica com alerta na UI). */
  allowNone?: boolean;
}) {
  // O `items` é obrigatório para o trigger exibir o nome do sistema em vez do
  // id bruto (Base UI Select resolve o rótulo do valor selecionado por aqui).
  const items: Record<string, string> = Object.fromEntries(
    systems.map((s) => [s._id, systemLabel(s)])
  );
  if (allowNone) items[NO_SYSTEM_VALUE] = "Sem sistema";

  return (
    <Select
      value={allowNone && value === null ? NO_SYSTEM_VALUE : value}
      items={items}
      onValueChange={(v) => {
        if (v === NO_SYSTEM_VALUE) {
          onChange(null);
          return;
        }
        onChange(v as Id<"systems">);
      }}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder="Selecione o sistema" />
      </SelectTrigger>
      <SelectContent>
        {allowNone && (
          <SelectItem value={NO_SYSTEM_VALUE}>Sem sistema</SelectItem>
        )}
        {systems.map((s) => (
          <SelectItem key={s._id} value={s._id}>
            {systemLabel(s)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const KIND_ITEMS: Record<string, string> = {
  evaporadora: "Evaporadora",
  condensadora: "Condensadora",
};

function toDateInputValue(ts: number | null | undefined): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toISOString().slice(0, 10);
}

export function EditEquipmentDialog({
  item,
  environmentId,
  systems,
  onClose,
}: {
  item: HierarchyItem | null;
  environmentId: Id<"environments"> | null;
  systems: SystemOption[];
  onClose: () => void;
}) {
  const upsert = useMutation(api.projectEquipment.upsertInEnvironment);
  const [systemId, setSystemId] = useState<Id<"systems"> | null>(null);
  const [kind, setKind] = useState<"condensadora" | "evaporadora">(
    "evaporadora"
  );
  const [modelo, setModelo] = useState("");
  const [capacidade, setCapacidade] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setSystemId(item.systemId);
      setKind(item.kind);
      setModelo(item.modelo ?? "");
      setCapacidade(item.capacidade ?? "");
      setSerialNumber(item.serialNumber ?? "");
      setDeadline(toDateInputValue(item.deadline));
    }
  }, [item]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item || !environmentId) return;
    setSaving(true);
    const ok = await runWithToast(
      () =>
        upsert({
          itemId: item._id,
          environmentId,
          systemId: systemId ?? undefined,
          kind,
          modelo: modelo.trim() || undefined,
          capacidade: capacidade.trim() || undefined,
          serialNumber: serialNumber.trim() || undefined,
          deadline: toTimestamp(deadline) ?? null,
        }),
      "Equipamento atualizado",
      "Não foi possível atualizar o equipamento"
    );
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar equipamento</DialogTitle>
          <DialogDescription>
            Atualize os dados do equipamento.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-equip-system">Sistema</Label>
              <SystemSelect
                id="edit-equip-system"
                systems={systems}
                value={systemId}
                onChange={setSystemId}
                allowNone
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={kind}
                items={KIND_ITEMS}
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-equip-modelo">Modelo</Label>
              <Input
                id="edit-equip-modelo"
                placeholder="Ex: MSZ-GL12"
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-equip-cap">Capacidade</Label>
              <Input
                id="edit-equip-cap"
                placeholder="Ex: 12.000 BTUs"
                value={capacidade}
                onChange={(e) => setCapacidade(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-equip-serial">Nº de série (opcional)</Label>
              <Input
                id="edit-equip-serial"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-equip-deadline">Prazo (opcional)</Label>
              <Input
                id="edit-equip-deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
