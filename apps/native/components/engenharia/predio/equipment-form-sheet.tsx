import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { Calendar, Cpu, Hash, Layers, Tag } from "lucide-react-native";
import { useEffect, useState } from "react";

import { AppButton, Field, PickerField, SegmentedField, Sheet, useToast } from "@/components/ui";
import { EQUIPMENT_STATUS_OPTIONS, type EquipmentStatus } from "@/lib/equipment-status";
import { getErrorMessage } from "@/lib/errors";
import { maskDateInput, parseDateInput, toDateInput } from "@/lib/format";
import { colors } from "@/lib/theme";

import { KIND_LABELS, type EquipKind, type HierarchyItem, type HierarchySystem } from "./types";

/** Criar / editar equipamento planejado dentro de um ambiente. */
export function EquipmentFormSheet({
  open,
  onClose,
  environmentId,
  environmentName,
  systems,
  item,
}: {
  open: boolean;
  onClose: () => void;
  environmentId: Id<"environments">;
  environmentName: string;
  systems: HierarchySystem[];
  item?: HierarchyItem | null;
}) {
  const toast = useToast();
  const upsert = useMutation(api.projectEquipment.upsertInEnvironment);
  const isEdit = Boolean(item);

  const [kind, setKind] = useState<EquipKind>("evaporadora");
  const [systemId, setSystemId] = useState<string | null>(null);
  const [modelo, setModelo] = useState("");
  const [capacidade, setCapacidade] = useState("");
  const [serial, setSerial] = useState("");
  const [status, setStatus] = useState<EquipmentStatus>("installing");
  const [deadline, setDeadline] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind(item?.kind ?? "evaporadora");
    setSystemId(item?.systemId ?? systems[0]?._id ?? null);
    setModelo(item?.modelo ?? "");
    setCapacidade(item?.capacidade ?? "");
    setSerial(item?.serialNumber ?? "");
    setStatus(item?.status ?? "installing");
    setDeadline(toDateInput(item?.deadline));
    setErrors({});
  }, [open, item, systems]);

  async function submit() {
    const nextErrors: Record<string, string> = {};
    if (deadline && parseDateInput(deadline) === null) nextErrors.deadline = "Data inválida (dd/mm/aaaa)";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSaving(true);
    try {
      await upsert({
        itemId: item?._id,
        environmentId,
        systemId: (systemId as Id<"systems"> | null) ?? undefined,
        kind,
        modelo: modelo.trim(),
        capacidade: capacidade.trim(),
        serialNumber: serial.trim() || undefined,
        status,
        deadline: deadline ? parseDateInput(deadline) : null,
      });
      toast.success(isEdit ? "Equipamento atualizado" : "Equipamento adicionado");
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível salvar o equipamento"));
    } finally {
      setSaving(false);
    }
  }

  const iconColor = colors.icon;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar equipamento" : "Novo equipamento"}
      subtitle={environmentName}
      footer={<AppButton label={isEdit ? "Salvar alterações" : "Adicionar"} onPress={() => void submit()} loading={saving} />}
    >
      <SegmentedField<EquipKind>
        label="Tipo"
        value={kind}
        onChange={setKind}
        options={[
          { value: "evaporadora", label: KIND_LABELS.evaporadora },
          { value: "condensadora", label: KIND_LABELS.condensadora },
        ]}
      />
      <PickerField
        label="Sistema"
        icon={<Layers size={24} color={iconColor} strokeWidth={1.6} />}
        value={systemId}
        onChange={setSystemId}
        options={systems.map((s) => ({ value: s._id as string, label: s.name, description: s.type }))}
        clearable
        placeholder="Sem sistema"
        emptyText="Cadastre sistemas em “Sistemas” no topo da tela."
      />
      <Field
        label="Modelo"
        icon={<Cpu size={24} color={iconColor} strokeWidth={1.6} />}
        value={modelo}
        onChangeText={setModelo}
        placeholder="Ex: MSZ-GL12"
        autoCapitalize="characters"
      />
      <Field
        label="Capacidade"
        icon={<Tag size={24} color={iconColor} strokeWidth={1.6} />}
        value={capacidade}
        onChangeText={setCapacidade}
        placeholder="Ex: 12.000 BTUs"
      />
      <Field
        label="Nº de série"
        icon={<Hash size={24} color={iconColor} strokeWidth={1.6} />}
        value={serial}
        onChangeText={setSerial}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <PickerField<EquipmentStatus>
        label="Status"
        value={status}
        onChange={(next) => next && setStatus(next)}
        options={EQUIPMENT_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
      />
      <Field
        label="Prazo"
        icon={<Calendar size={24} color={iconColor} strokeWidth={1.6} />}
        value={deadline}
        onChangeText={(v) => setDeadline(maskDateInput(v))}
        keyboardType="number-pad"
        placeholder="dd/mm/aaaa"
        error={errors.deadline}
      />
    </Sheet>
  );
}
