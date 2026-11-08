import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { Link2, MapPinned } from "lucide-react-native";
import { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { AppButton, Chips, EmptyState, LoadingState, Pill, PickerField, Sheet, Surface, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { colors, space, type } from "@/lib/theme";

type Worksite = FunctionReturnType<typeof api.timeClock.listRhidWorksites>[number];
type Filter = "sem" | "todas";

/** Cercas do RHID (ficha R14): ligar cada cerca a uma obra. */
export default function CercasRhidScreen() {
  const toast = useToast();
  const worksites = useQuery(api.timeClock.listRhidWorksites, {});
  const projects = useQuery(api.timeClock.listProjectOptions, {});
  const linkWorksite = useMutation(api.timeClock.linkWorksite);
  const [filter, setFilter] = useState<Filter>("sem");
  const [editing, setEditing] = useState<Worksite | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const list = useMemo(() => (worksites ?? []).filter((w) => filter === "todas" || !w.projectId), [worksites, filter]);
  const options = useMemo(() => (projects ?? []).map((p) => ({ value: p._id as string, label: p.name })), [projects]);

  async function save(value: string | null) {
    if (!editing) return;
    setSaving(true);
    try {
      await linkWorksite({ rhidGeofenceId: editing.rhidGeofenceId, projectId: value as Id<"projects"> | null });
      toast.success(value ? "Cerca vinculada à obra" : "Vínculo removido");
      setEditing(null);
    } catch (err) {
      toast.error(getErrorMessage(err, "Não deu para salvar. Tente de novo."));
    } finally {
      setSaving(false);
    }
  }

  if (worksites === undefined) return <LoadingState />;
  const unlinked = worksites.filter((w) => !w.projectId).length;

  return (
    <View style={styles.screen}>
      <Chips<Filter>
        items={[
          { key: "sem", label: "Sem obra", count: unlinked },
          { key: "todas", label: "Todas" },
        ]}
        active={filter}
        onChange={setFilter}
        style={{ paddingHorizontal: space.screen, paddingTop: space.lg }}
      />
      <FlatList
        data={list}
        keyExtractor={(w) => String(w.rhidGeofenceId)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Surface
            onPress={() => {
              setEditing(item);
              setProjectId(item.projectId ?? null);
            }}
            accessibilityLabel={`${item.name}, ${item.projectName ? `obra ${item.projectName}` : "sem obra"}`}
          >
            <View style={styles.row}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                  {item.projectName ? `Obra ${item.projectName}` : `Raio de ${Math.round(item.radius)} m`}
                </Text>
              </View>
              {item.projectId ? <Pill label="Vinculada" tone="success" /> : <Pill label="Sem obra" tone="warning" />}
            </View>
          </Surface>
        )}
        ListEmptyComponent={
          <EmptyState
            icon={<MapPinned size={28} color={colors.primary} />}
            title={filter === "sem" ? "Todas as cercas têm obra" : "Nenhuma cerca do RHID"}
            description="As cercas são criadas no RHID e chegam aqui na sincronização."
          />
        }
      />

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.name ?? ""}
        subtitle="Cerca do RHID"
        footer={
          <View style={{ gap: space.sm }}>
            <AppButton label="Salvar vínculo" block icon={<Link2 size={18} color={colors.onPrimary} />} disabled={!projectId || projectId === editing?.projectId} loading={saving} onPress={() => void save(projectId)} />
            {editing?.projectId ? <AppButton label="Remover vínculo" variant="danger" block disabled={saving} onPress={() => void save(null)} /> : null}
          </View>
        }
      >
        <PickerField label="Obra" value={projectId} options={options} onChange={setProjectId} searchable placeholder="Escolha a obra" loading={projects === undefined} />
        <Text style={[type.bodySm, { color: colors.textSecondary, marginTop: space.sm }]}>
          Quem marcar o ponto dentro desta cerca conta como presente nesta obra.
        </Text>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: space.screen, paddingBottom: 48, gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
