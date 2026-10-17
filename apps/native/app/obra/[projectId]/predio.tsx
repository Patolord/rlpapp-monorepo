import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { Building2, HardHat, Layers, PackageOpen, Pencil, Plus, Trash2 } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { FloorSheet } from "@/components/engenharia/predio/floor-sheet";
import { FloorsAddSheet } from "@/components/engenharia/predio/floors-add-sheet";
import { SimpleFormSheet } from "@/components/engenharia/predio/simple-form-sheet";
import { SystemsSheet } from "@/components/engenharia/predio/systems-sheet";
import { TechniciansSheet } from "@/components/engenharia/predio/technicians-sheet";
import { progressLabel, progressTone, type HierarchyFloor } from "@/components/engenharia/predio/types";
import { UnassignedSheet } from "@/components/engenharia/predio/unassigned-sheet";
import {
  AppButton,
  Chips,
  ConfirmDialog,
  EmptyState,
  IconButton,
  LoadingState,
  Pill,
  SectionTitle,
  StatTile,
  Surface,
  useToast,
} from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { colors, radius, space, type } from "@/lib/theme";

/** Prédio da obra: torres → andares → ambientes → equipamentos planejados. */
export default function PredioScreen() {
  const toast = useToast();
  const { projectId: raw } = useLocalSearchParams<{ projectId: string }>();
  const projectId = raw as Id<"projects">;

  const hierarchy = useQuery(api.projects.getHierarchy, { projectId });
  const unassigned = useQuery(api.projectEquipment.listUnassigned, { projectId });
  const createTower = useMutation(api.towers.create);
  const updateTower = useMutation(api.towers.update);
  const removeTower = useMutation(api.towers.remove);

  const [towerId, setTowerId] = useState<string | null>(null);
  const [floorId, setFloorId] = useState<string | null>(null);
  const [towerForm, setTowerForm] = useState<"create" | "rename" | null>(null);
  const [addingFloors, setAddingFloors] = useState(false);
  const [systemsOpen, setSystemsOpen] = useState(false);
  const [techOpen, setTechOpen] = useState(false);
  const [unassignedOpen, setUnassignedOpen] = useState(false);
  const [confirmTower, setConfirmTower] = useState(false);
  const [busy, setBusy] = useState(false);

  const towers = useMemo(() => hierarchy?.towers ?? [], [hierarchy]);
  const tower = towers.find((t) => t._id === towerId) ?? towers[0] ?? null;
  const floors = useMemo(() => [...(tower?.floors ?? [])].sort((a, b) => b.number - a.number), [tower]);
  const floor: HierarchyFloor | null = floors.find((f) => f._id === floorId) ?? null;

  useEffect(() => {
    if (tower && towerId !== tower._id) setTowerId(tower._id);
  }, [tower, towerId]);

  const totals = useMemo(() => {
    const all = towers.flatMap((t) => t.floors);
    return {
      total: all.reduce((s, f) => s + f.totalItems, 0),
      installed: all.reduce((s, f) => s + f.installedItems, 0),
      environments: all.reduce((s, f) => s + f.environments.length, 0),
    };
  }, [towers]);

  async function doRemoveTower() {
    if (!tower) return;
    setBusy(true);
    try {
      await removeTower({ towerId: tower._id });
      toast.success("Torre removida");
      setConfirmTower(false);
      setTowerId(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível remover a torre"));
    } finally {
      setBusy(false);
    }
  }

  if (hierarchy === undefined) return <LoadingState message="Carregando prédio..." />;
  if (hierarchy === null) {
    return (
      <View style={{ padding: space.screen }}>
        <EmptyState icon={<Building2 size={30} color={colors.primary} strokeWidth={1.8} />} title="Obra não encontrada" />
      </View>
    );
  }

  const unassignedCount = unassigned?.length ?? 0;

  return (
    <>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.stats}>
          <StatTile label="Instalados" value={`${totals.installed}/${totals.total}`} tone={progressTone(totals.installed, totals.total)} hint={`${totals.environments} ambiente${totals.environments === 1 ? "" : "s"}`} />
          <StatTile
            label="Sistemas"
            value={hierarchy.systems.length}
            icon={<Layers size={16} color={colors.primary} />}
            hint={unassignedCount > 0 ? `${unassignedCount} sem ambiente` : "tudo posicionado"}
            tone={unassignedCount > 0 ? "warning" : "info"}
            onPress={() => setSystemsOpen(true)}
          />
        </View>

        <View style={styles.actions}>
          <AppButton label="Sistemas" variant="secondary" size="sm" icon={<Layers size={18} color={colors.text} strokeWidth={2} />} onPress={() => setSystemsOpen(true)} style={{ flex: 1 }} />
          <AppButton label="Técnicos" variant="secondary" size="sm" icon={<HardHat size={18} color={colors.text} strokeWidth={2} />} onPress={() => setTechOpen(true)} style={{ flex: 1 }} />
          <AppButton
            label={unassignedCount > 0 ? `Sem ambiente (${unassignedCount})` : "Sem ambiente"}
            variant="secondary"
            size="sm"
            icon={<PackageOpen size={18} color={unassignedCount > 0 ? colors.warning : colors.text} strokeWidth={2} />}
            onPress={() => setUnassignedOpen(true)}
            style={{ flex: 1.2 }}
          />
        </View>

        {towers.length === 0 ? (
          <EmptyState
            icon={<Building2 size={30} color={colors.primary} strokeWidth={1.8} />}
            title="Nenhuma torre ainda"
            description="Comece criando a primeira torre; depois adicione andares e ambientes."
            actionLabel="Criar torre"
            onAction={() => setTowerForm("create")}
          />
        ) : (
          <>
            <SectionTitle title="Torres" style={styles.section} action="Nova torre" onAction={() => setTowerForm("create")} />
            <Chips
              active={tower?._id ?? ""}
              onChange={(id) => setTowerId(id)}
              items={towers.map((t) => ({ key: t._id, label: t.name, count: t.floors.length }))}
              style={{ paddingHorizontal: 0 }}
            />

            {tower ? (
              <>
                <View style={styles.towerHeader}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[type.heading, { color: colors.text }]} numberOfLines={1}>
                      {tower.name}
                    </Text>
                    <Text style={[type.caption, { color: colors.textMuted }]}>
                      {tower.floors.length} andar{tower.floors.length === 1 ? "" : "es"}
                    </Text>
                  </View>
                  <IconButton label="Renomear torre" icon={<Pencil size={18} color={colors.text} strokeWidth={2} />} onPress={() => setTowerForm("rename")} />
                  <IconButton label="Remover torre" icon={<Trash2 size={18} color={colors.danger} strokeWidth={2} />} onPress={() => setConfirmTower(true)} />
                  <IconButton label="Adicionar andares" tone="primary" icon={<Plus size={20} color={colors.onPrimary} strokeWidth={2.2} />} onPress={() => setAddingFloors(true)} />
                </View>

                {floors.length === 0 ? (
                  <EmptyState
                    title="Sem andares"
                    description="Adicione um intervalo de andares para começar a montar o prédio."
                    actionLabel="Adicionar andares"
                    onAction={() => setAddingFloors(true)}
                  />
                ) : (
                  <Surface padded={false}>
                    {floors.map((f, index) => {
                      const pct = f.totalItems > 0 ? Math.round((f.installedItems / f.totalItems) * 100) : 0;
                      return (
                        <Surface
                          key={f._id}
                          onPress={() => setFloorId(f._id)}
                          padded={false}
                          style={[styles.floorRow, index > 0 && styles.floorBorder, { borderRadius: 0, borderWidth: 0 }]}
                        >
                          <View style={styles.floorNumber}>
                            <Text style={[type.bodyStrong, { color: colors.text }]}>{f.number}</Text>
                          </View>
                          <View style={{ flex: 1, gap: 6 }}>
                            <View style={styles.floorTop}>
                              <Text style={[type.bodyStrong, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                                {f.label}
                              </Text>
                              <Pill label={progressLabel(f.installedItems, f.totalItems)} tone={progressTone(f.installedItems, f.totalItems)} />
                            </View>
                            <View style={styles.track}>
                              <View style={[styles.bar, { width: `${pct}%` }]} />
                            </View>
                            <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
                              {f.environments.length === 0 ? "Sem ambientes" : f.environments.map((e) => e.name).join(" · ")}
                            </Text>
                          </View>
                        </Surface>
                      );
                    })}
                  </Surface>
                )}
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      <SimpleFormSheet
        open={towerForm !== null}
        onClose={() => setTowerForm(null)}
        title={towerForm === "rename" ? "Renomear torre" : "Nova torre"}
        fields={[{ key: "name", label: "Nome da torre", required: true, placeholder: "Ex: Torre A, Bloco 1" }]}
        initial={towerForm === "rename" && tower ? { name: tower.name } : undefined}
        submitLabel={towerForm === "rename" ? "Salvar" : "Criar torre"}
        successMessage={towerForm === "rename" ? "Torre atualizada" : "Torre criada"}
        onSubmit={async (values) => {
          if (towerForm === "rename" && tower) {
            await updateTower({ towerId: tower._id, name: values.name });
          } else {
            const id = await createTower({ projectId, name: values.name });
            setTowerId(id);
          }
        }}
      />
      <FloorsAddSheet open={addingFloors} onClose={() => setAddingFloors(false)} tower={tower} />
      <FloorSheet floor={floor} tower={tower} systems={hierarchy.systems} onClose={() => setFloorId(null)} />
      <SystemsSheet open={systemsOpen} onClose={() => setSystemsOpen(false)} projectId={projectId} systems={hierarchy.systems} />
      <TechniciansSheet open={techOpen} onClose={() => setTechOpen(false)} projectId={projectId} />
      <UnassignedSheet open={unassignedOpen} onClose={() => setUnassignedOpen(false)} projectId={projectId} hierarchy={hierarchy} />

      <ConfirmDialog
        open={confirmTower}
        title="Remover torre?"
        description={`Todos os andares, ambientes e equipamentos de ${tower?.name ?? "esta torre"} serão removidos.`}
        confirmLabel="Remover"
        destructive
        busy={busy}
        onCancel={() => setConfirmTower(false)}
        onConfirm={() => void doRemoveTower()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.screen, paddingTop: space.lg, paddingBottom: space.xxl * 2, gap: space.md },
  stats: { flexDirection: "row", gap: space.md },
  actions: { flexDirection: "row", gap: space.sm },
  section: { paddingHorizontal: 0, paddingTop: space.sm, paddingBottom: space.xs },
  towerHeader: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingTop: space.sm },
  floorRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: 12 },
  floorBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  floorNumber: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  floorTop: { flexDirection: "row", alignItems: "center", gap: space.sm },
  track: { height: 6, borderRadius: radius.pill, backgroundColor: colors.track, overflow: "hidden" },
  bar: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.primary },
});
