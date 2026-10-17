import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { Pencil, Plus, QrCode, Snowflake, Trash2, Wind } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AppButton, ConfirmDialog, IconButton, Pill, Sheet, Surface, useToast } from "@/components/ui";
import { EQUIPMENT_STATUS_LABELS } from "@/lib/equipment-status";
import { getErrorMessage } from "@/lib/errors";
import { colors, space, type } from "@/lib/theme";

import { EquipmentFormSheet } from "./equipment-form-sheet";
import { SimpleFormSheet } from "./simple-form-sheet";
import {
  STATUS_TONE,
  equipmentTitle,
  progressLabel,
  progressTone,
  type HierarchyEnvironment,
  type HierarchyItem,
  type HierarchySystem,
} from "./types";

/** Ambiente: lista de equipamentos planejados com ações. */
export function EnvironmentSheet({
  environment,
  floorLabel,
  systems,
  onClose,
}: {
  environment: HierarchyEnvironment | null;
  floorLabel: string;
  systems: HierarchySystem[];
  onClose: () => void;
}) {
  const toast = useToast();
  const updateEnvironment = useMutation(api.environments.update);
  const removeEnvironment = useMutation(api.environments.remove);
  const removeItem = useMutation(api.projectEquipment.remove);

  const [form, setForm] = useState<{ open: boolean; item: HierarchyItem | null }>({ open: false, item: null });
  const [renaming, setRenaming] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "env" } | { kind: "item"; item: HierarchyItem } | null>(null);
  const [busy, setBusy] = useState(false);

  const installed = environment?.equipment.filter((e) => e.status === "operational").length ?? 0;
  const total = environment?.equipment.length ?? 0;

  async function confirmRemove() {
    if (!confirm || !environment) return;
    setBusy(true);
    try {
      if (confirm.kind === "env") {
        await removeEnvironment({ environmentId: environment._id });
        toast.success("Ambiente removido");
        setConfirm(null);
        onClose();
      } else {
        await removeItem({ itemId: confirm.item._id });
        toast.success("Equipamento removido");
        setConfirm(null);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível remover"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Sheet
        open={environment !== null}
        onClose={onClose}
        title={environment?.name ?? "Ambiente"}
        subtitle={environment ? `${floorLabel}${environment.type ? ` · ${environment.type}` : ""}` : undefined}
        footer={
          environment ? (
            <AppButton
              label="Adicionar equipamento"
              icon={<Plus size={22} color={colors.onPrimary} strokeWidth={2.2} />}
              onPress={() => setForm({ open: true, item: null })}
            />
          ) : undefined
        }
      >
        {environment ? (
          <>
            <View style={styles.headerRow}>
              <Pill label={progressLabel(installed, total)} tone={progressTone(installed, total)} />
              <View style={{ flexDirection: "row" }}>
                <IconButton label="Renomear ambiente" tone="ghost" size={36} icon={<Pencil size={18} color={colors.text} strokeWidth={2} />} onPress={() => setRenaming(true)} />
                <IconButton label="Remover ambiente" tone="ghost" size={36} icon={<Trash2 size={18} color={colors.danger} strokeWidth={2} />} onPress={() => setConfirm({ kind: "env" })} />
              </View>
            </View>

            {environment.equipment.length === 0 ? (
              <Surface style={{ alignItems: "center", paddingVertical: space.xl }}>
                <Text style={[type.bodySm, { color: colors.textSecondary }]}>Nenhum equipamento neste ambiente.</Text>
              </Surface>
            ) : (
              <View style={{ gap: space.sm }}>
                {environment.equipment.map((item) => {
                  const Icon = item.kind === "condensadora" ? Wind : Snowflake;
                  return (
                    <Surface key={item._id} onPress={() => setForm({ open: true, item })} style={styles.item} padded={false}>
                      <View style={styles.itemIcon}>
                        <Icon size={20} color={colors.primary} strokeWidth={1.8} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                          {equipmentTitle(item)}
                        </Text>
                        <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
                          {[item.kind === "condensadora" ? "Condensadora" : "Evaporadora", item.system || null, item.serialNumber ? `S/N ${item.serialNumber}` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                        <View style={styles.itemMeta}>
                          <Pill label={EQUIPMENT_STATUS_LABELS[item.status]} tone={STATUS_TONE[item.status]} />
                          {item.token ? <Pill label={item.token} tone="neutral" icon={<QrCode size={11} color={colors.textSecondary} />} /> : null}
                        </View>
                      </View>
                      <IconButton
                        label="Remover equipamento"
                        tone="ghost"
                        size={36}
                        icon={<Trash2 size={18} color={colors.danger} strokeWidth={2} />}
                        onPress={() => setConfirm({ kind: "item", item })}
                      />
                    </Surface>
                  );
                })}
              </View>
            )}
          </>
        ) : null}
      </Sheet>

      {environment ? (
        <>
          <EquipmentFormSheet
            open={form.open}
            onClose={() => setForm((f) => ({ ...f, open: false }))}
            environmentId={environment._id}
            environmentName={environment.name}
            systems={systems}
            item={form.item}
          />
          <SimpleFormSheet
            open={renaming}
            onClose={() => setRenaming(false)}
            title="Editar ambiente"
            fields={[
              { key: "name", label: "Nome do ambiente", required: true, placeholder: "Ex: Sala de Estar" },
              { key: "type", label: "Tipo", placeholder: "Ex: Área técnica, Dormitório" },
            ]}
            initial={{ name: environment.name, type: environment.type ?? "" }}
            successMessage="Ambiente atualizado"
            onSubmit={async (values) => {
              await updateEnvironment({
                environmentId: environment._id as Id<"environments">,
                name: values.name,
                type: values.type || null,
              });
            }}
          />
        </>
      ) : null}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.kind === "env" ? "Remover ambiente?" : "Remover equipamento?"}
        description={
          confirm?.kind === "env"
            ? `Todos os equipamentos de ${environment?.name ?? "este ambiente"} serão removidos junto.`
            : "O equipamento planejado será removido da obra. Etiquetas vinculadas ficam livres."
        }
        confirmLabel="Remover"
        destructive
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void confirmRemove()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  item: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingLeft: space.md, paddingRight: 6, paddingVertical: 10 },
  itemIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  itemMeta: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
});
