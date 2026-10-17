import { api } from "@rlpapp/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { Copy, DoorOpen, Pencil, Plus, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppButton, ConfirmDialog, IconButton, ListRow, Pill, Sheet, Surface, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { colors, radius, space, type } from "@/lib/theme";

import { EnvironmentSheet } from "./environment-sheet";
import { SimpleFormSheet } from "./simple-form-sheet";
import { progressLabel, progressTone, type HierarchyFloor, type HierarchySystem, type HierarchyTower } from "./types";

/** Andar: ambientes, renomear, replicar para outros andares, remover. */
export function FloorSheet({
  floor,
  tower,
  systems,
  onClose,
}: {
  floor: HierarchyFloor | null;
  tower: HierarchyTower | null;
  systems: HierarchySystem[];
  onClose: () => void;
}) {
  const toast = useToast();
  const createEnvironment = useMutation(api.environments.create);
  const updateFloor = useMutation(api.floors.update);
  const removeFloor = useMutation(api.floors.remove);
  const replicate = useMutation(api.floors.replicate);

  const [envId, setEnvId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [replicating, setReplicating] = useState(false);
  const [targets, setTargets] = useState<Set<string>>(new Set());
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);

  // Mantém o ambiente selecionado sincronizado com a árvore ao vivo.
  const environment = floor?.environments.find((e) => e._id === envId) ?? null;
  const otherFloors = (tower?.floors ?? []).filter((f) => f._id !== floor?._id);

  async function doRemove() {
    if (!floor) return;
    setBusy(true);
    try {
      await removeFloor({ floorId: floor._id });
      toast.success("Andar removido");
      setConfirmRemove(false);
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível remover o andar"));
    } finally {
      setBusy(false);
    }
  }

  async function doReplicate() {
    if (!floor || targets.size === 0) return;
    setBusy(true);
    try {
      const result = await replicate({
        sourceFloorId: floor._id,
        targetFloorIds: [...targets] as HierarchyFloor["_id"][],
        renames: [],
      });
      toast.success(`${result.environments} ambiente${result.environments === 1 ? "" : "s"} replicado${result.environments === 1 ? "" : "s"} em ${result.floors} andar${result.floors === 1 ? "" : "es"}`);
      setReplicating(false);
      setTargets(new Set());
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível replicar"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Sheet
        open={floor !== null && !replicating}
        onClose={onClose}
        title={floor?.label ?? "Andar"}
        subtitle={tower?.name}
        footer={
          floor ? (
            <AppButton
              label="Adicionar ambiente"
              icon={<Plus size={22} color={colors.onPrimary} strokeWidth={2.2} />}
              onPress={() => setAdding(true)}
            />
          ) : undefined
        }
      >
        {floor ? (
          <>
            <View style={styles.headerRow}>
              <Pill label={progressLabel(floor.installedItems, floor.totalItems)} tone={progressTone(floor.installedItems, floor.totalItems)} />
              <View style={{ flexDirection: "row" }}>
                <IconButton label="Renomear andar" tone="ghost" size={36} icon={<Pencil size={18} color={colors.text} strokeWidth={2} />} onPress={() => setRenaming(true)} />
                <IconButton
                  label="Replicar andar"
                  tone="ghost"
                  size={36}
                  disabled={floor.environments.length === 0 || otherFloors.length === 0}
                  icon={<Copy size={18} color={colors.text} strokeWidth={2} />}
                  onPress={() => setReplicating(true)}
                />
                <IconButton label="Remover andar" tone="ghost" size={36} icon={<Trash2 size={18} color={colors.danger} strokeWidth={2} />} onPress={() => setConfirmRemove(true)} />
              </View>
            </View>

            {floor.environments.length === 0 ? (
              <Surface style={{ alignItems: "center", paddingVertical: space.xl, gap: space.sm }}>
                <Text style={[type.bodySm, { color: colors.textSecondary }]}>Nenhum ambiente neste andar.</Text>
              </Surface>
            ) : (
              <View style={{ gap: space.sm }}>
                {floor.environments.map((env) => {
                  const installed = env.equipment.filter((e) => e.status === "operational").length;
                  return (
                    <ListRow
                      key={env._id}
                      icon={<DoorOpen size={20} color={colors.primary} strokeWidth={1.8} />}
                      title={env.name}
                      subtitle={env.type}
                      trailing={<Pill label={progressLabel(installed, env.equipment.length)} tone={progressTone(installed, env.equipment.length)} />}
                      onPress={() => setEnvId(env._id)}
                    />
                  );
                })}
              </View>
            )}
          </>
        ) : null}
      </Sheet>

      {/* Replicar: escolher andares de destino */}
      <Sheet
        open={replicating}
        onClose={() => setReplicating(false)}
        title="Replicar andar"
        subtitle={floor ? `Copia os ambientes de ${floor.label} (sem equipamentos) para os andares escolhidos.` : undefined}
        maxHeight={0.85}
        footer={
          <AppButton
            label={targets.size > 0 ? `Replicar em ${targets.size} andar${targets.size === 1 ? "" : "es"}` : "Escolha os andares"}
            disabled={targets.size === 0}
            loading={busy}
            onPress={() => void doReplicate()}
          />
        }
      >
        <View style={styles.targets}>
          {otherFloors.map((f) => {
            const active = targets.has(f._id);
            return (
              <Pressable
                key={f._id}
                onPress={() =>
                  setTargets((current) => {
                    const next = new Set(current);
                    if (next.has(f._id)) next.delete(f._id);
                    else next.add(f._id);
                    return next;
                  })
                }
                style={[styles.target, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
              >
                <Text style={[type.label, { color: active ? colors.onPrimary : colors.text }]}>{f.label}</Text>
                {f.environments.length > 0 ? (
                  <Text style={[type.caption, { color: active ? colors.onPrimary : colors.textMuted }]}>{f.environments.length} amb.</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <Text style={[type.caption, { color: colors.textMuted }]}>
          Andares que já têm ambientes recebem os novos ao lado dos existentes.
        </Text>
      </Sheet>

      {floor ? (
        <>
          <SimpleFormSheet
            open={adding}
            onClose={() => setAdding(false)}
            title="Novo ambiente"
            subtitle={floor.label}
            fields={[
              { key: "name", label: "Nome do ambiente", required: true, placeholder: "Ex: Sala de Estar" },
              { key: "type", label: "Tipo", placeholder: "Ex: Área técnica, Dormitório" },
            ]}
            submitLabel="Criar ambiente"
            successMessage="Ambiente criado"
            onSubmit={async (values) => {
              await createEnvironment({ floorId: floor._id, name: values.name, type: values.type || undefined });
            }}
          />
          <SimpleFormSheet
            open={renaming}
            onClose={() => setRenaming(false)}
            title="Renomear andar"
            fields={[{ key: "label", label: "Nome do andar", required: true, placeholder: "Ex: 3º andar, Térreo, Cobertura" }]}
            initial={{ label: floor.label }}
            successMessage="Andar atualizado"
            onSubmit={async (values) => {
              await updateFloor({ floorId: floor._id, label: values.label });
            }}
          />
          <EnvironmentSheet environment={environment} floorLabel={floor.label} systems={systems} onClose={() => setEnvId(null)} />
        </>
      ) : null}

      <ConfirmDialog
        open={confirmRemove}
        title="Remover andar?"
        description={`Todos os ambientes e equipamentos de ${floor?.label ?? "este andar"} serão removidos.`}
        confirmLabel="Remover"
        destructive
        busy={busy}
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => void doRemove()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  targets: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  target: {
    minWidth: 96,
    alignItems: "center",
    gap: 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
});
