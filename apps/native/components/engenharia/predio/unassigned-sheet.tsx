import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { PackageOpen, Snowflake, Trash2, Wind } from "lucide-react-native";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AppButton, ConfirmDialog, EmptyState, IconButton, LoadingState, PickerField, Pill, Sheet, Surface, useToast } from "@/components/ui";
import { EQUIPMENT_STATUS_LABELS } from "@/lib/equipment-status";
import { getErrorMessage } from "@/lib/errors";
import { colors, space, type } from "@/lib/theme";

import { STATUS_TONE, equipmentTitle, type Hierarchy } from "./types";

type Unassigned = NonNullable<ReturnType<typeof useQuery<typeof api.projectEquipment.listUnassigned>>>[number];

/** Equipamentos planejados ainda sem ambiente: atribuir ou remover. */
export function UnassignedSheet({
  open,
  onClose,
  projectId,
  hierarchy,
}: {
  open: boolean;
  onClose: () => void;
  projectId: Id<"projects">;
  hierarchy: Hierarchy;
}) {
  const toast = useToast();
  const items = useQuery(api.projectEquipment.listUnassigned, open ? { projectId } : "skip");
  const assign = useMutation(api.projectEquipment.assignToEnvironment);
  const remove = useMutation(api.projectEquipment.remove);
  const [assigning, setAssigning] = useState<Unassigned | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Unassigned | null>(null);
  const [busy, setBusy] = useState(false);

  const environmentOptions = useMemo(
    () =>
      hierarchy.towers.flatMap((tower) =>
        tower.floors.flatMap((floor) =>
          floor.environments.map((env) => ({
            value: env._id as string,
            label: env.name,
            description: `${tower.name} · ${floor.label}`,
          }))
        )
      ),
    [hierarchy]
  );

  async function doAssign() {
    if (!assigning || !target) return;
    setBusy(true);
    try {
      await assign({ itemId: assigning._id, environmentId: target as Id<"environments">, systemId: assigning.systemId ?? undefined });
      toast.success("Equipamento atribuído");
      setAssigning(null);
      setTarget(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível atribuir"));
    } finally {
      setBusy(false);
    }
  }

  async function doRemove() {
    if (!removing) return;
    setBusy(true);
    try {
      await remove({ itemId: removing._id });
      toast.success("Equipamento removido");
      setRemoving(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível remover"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Sheet open={open && !assigning} onClose={onClose} title="Sem ambiente" subtitle="Equipamentos planejados que ainda não foram posicionados no prédio.">
        {items === undefined ? (
          <LoadingState style={{ flex: 0, paddingVertical: space.xl }} />
        ) : items.length === 0 ? (
          <EmptyState icon={<PackageOpen size={30} color={colors.primary} strokeWidth={1.8} />} title="Tudo posicionado" description="Nenhum equipamento aguardando ambiente." />
        ) : (
          <View style={{ gap: space.sm }}>
            {items.map((item) => {
              const Icon = item.kind === "condensadora" ? Wind : Snowflake;
              return (
                <Surface key={item._id} style={styles.row} padded={false}>
                  <View style={styles.icon}>
                    <Icon size={20} color={colors.primary} strokeWidth={1.8} />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                      {equipmentTitle(item)}
                    </Text>
                    <View style={styles.meta}>
                      <Pill label={EQUIPMENT_STATUS_LABELS[item.status]} tone={STATUS_TONE[item.status]} />
                      {item.system ? <Pill label={item.system} tone="neutral" /> : <Pill label="Sem sistema" tone="warning" />}
                    </View>
                  </View>
                  <AppButton label="Atribuir" size="sm" trailing={null} onPress={() => setAssigning(item)} />
                  <IconButton label="Remover" tone="ghost" size={36} icon={<Trash2 size={18} color={colors.danger} strokeWidth={2} />} onPress={() => setRemoving(item)} />
                </Surface>
              );
            })}
          </View>
        )}
      </Sheet>

      <Sheet
        open={assigning !== null}
        onClose={() => {
          setAssigning(null);
          setTarget(null);
        }}
        title="Atribuir a um ambiente"
        subtitle={assigning ? equipmentTitle(assigning) : undefined}
        maxHeight={0.7}
        footer={<AppButton label="Atribuir" disabled={!target} loading={busy} onPress={() => void doAssign()} />}
      >
        <PickerField
          label="Ambiente *"
          value={target}
          onChange={setTarget}
          options={environmentOptions}
          searchable
          emptyText="Crie andares e ambientes na torre primeiro."
        />
      </Sheet>

      <ConfirmDialog
        open={removing !== null}
        title="Remover equipamento?"
        description="O equipamento planejado será removido da obra."
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
  meta: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});
