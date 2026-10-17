import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AppButton, ConfirmDialog, IconButton, Pill, Sheet, Surface, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { colors, space, type } from "@/lib/theme";

import { SimpleFormSheet } from "./simple-form-sheet";
import { progressLabel, progressTone, type HierarchySystem } from "./types";

const FIELDS = [
  { key: "name", label: "Nome do sistema", required: true, placeholder: "Ex: VRF Torre A, Split aptos" },
  { key: "type", label: "Tipo", placeholder: "Ex: VRF, Split" },
  { key: "obs", label: "Observações", multiline: true },
];

/** Sistemas da obra (VRF, Split...): criar, editar, remover. */
export function SystemsSheet({
  open,
  onClose,
  projectId,
  systems,
}: {
  open: boolean;
  onClose: () => void;
  projectId: Id<"projects">;
  systems: HierarchySystem[];
}) {
  const toast = useToast();
  const create = useMutation(api.systems.createSystemInProject);
  const update = useMutation(api.systems.updateSystemDetails);
  const remove = useMutation(api.systems.removeSystemFromProject);
  const [form, setForm] = useState<{ open: boolean; system: HierarchySystem | null }>({ open: false, system: null });
  const [removing, setRemoving] = useState<HierarchySystem | null>(null);
  const [busy, setBusy] = useState(false);

  async function doRemove() {
    if (!removing) return;
    setBusy(true);
    try {
      await remove({ systemId: removing._id });
      toast.success("Sistema removido");
      setRemoving(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível remover o sistema"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title="Sistemas"
        subtitle="Agrupam os equipamentos da obra (ex.: VRF Torre A)."
        footer={<AppButton label="Novo sistema" icon={<Plus size={22} color={colors.onPrimary} strokeWidth={2.2} />} onPress={() => setForm({ open: true, system: null })} />}
      >
        {systems.length === 0 ? (
          <Surface style={{ alignItems: "center", paddingVertical: space.xl }}>
            <Text style={[type.bodySm, { color: colors.textSecondary }]}>Nenhum sistema cadastrado.</Text>
          </Surface>
        ) : (
          <View style={{ gap: space.sm }}>
            {systems.map((system) => (
              <Surface key={system._id} style={styles.row} padded={false}>
                <View style={styles.icon}>
                  <Layers size={20} color={colors.primary} strokeWidth={1.8} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                    {system.name}
                    {system.type ? <Text style={[type.bodySm, { color: colors.textSecondary }]}> · {system.type}</Text> : null}
                  </Text>
                  <Pill label={progressLabel(system.installedItems, system.totalItems)} tone={progressTone(system.installedItems, system.totalItems)} />
                </View>
                <IconButton label="Editar sistema" tone="ghost" size={36} icon={<Pencil size={18} color={colors.text} strokeWidth={2} />} onPress={() => setForm({ open: true, system })} />
                <IconButton label="Remover sistema" tone="ghost" size={36} icon={<Trash2 size={18} color={colors.danger} strokeWidth={2} />} onPress={() => setRemoving(system)} />
              </Surface>
            ))}
          </View>
        )}
      </Sheet>

      <SimpleFormSheet
        open={form.open}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
        title={form.system ? "Editar sistema" : "Novo sistema"}
        fields={FIELDS}
        initial={form.system ? { name: form.system.name, type: form.system.type ?? "", obs: "" } : undefined}
        submitLabel={form.system ? "Salvar" : "Criar sistema"}
        successMessage={form.system ? "Sistema atualizado" : "Sistema criado"}
        onSubmit={async (values) => {
          if (form.system) {
            await update({ systemId: form.system._id, name: values.name, type: values.type || null, obs: values.obs || null });
          } else {
            await create({ projectId, name: values.name, type: values.type || undefined, obs: values.obs || undefined });
          }
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        title="Remover sistema?"
        description={removing && removing.totalItems > 0 ? `${removing.totalItems} equipamento${removing.totalItems === 1 ? "" : "s"} ficam sem sistema.` : "O sistema será removido da obra."}
        confirmLabel="Remover"
        destructive
        busy={busy}
        onCancel={() => setRemoving(null)}
        onConfirm={() => void doRemove()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingLeft: space.md, paddingRight: 6, paddingVertical: 10 },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
});
