import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatDate } from "@rlpapp/shared";
import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex/react";
import { Stack, useLocalSearchParams } from "expo-router";
import { Building2, ChevronRight, Layers } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Chips, EmptyState, LoadingState, MetricStrip, Pill, SectionTitle, Sheet, Surface } from "@/components/ui";
import { CLIENT_STATUS, PROJECT_STATUS_CLIENT, clientStatusOf } from "@/lib/client-status";
import { useNativeHeaderOptions } from "@/lib/native-header";
import { colors, radius, space, type } from "@/lib/theme";

type Hierarchy = NonNullable<FunctionReturnType<typeof api.portal.getProjectHierarchy>>;
type Floor = Hierarchy["towers"][number]["floors"][number];

/** Obra do cliente (fichas L2, L3 e L4): números, torres, andares e ambientes. */
export default function PortalProjectScreen() {
  const header = useNativeHeaderOptions();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const id = projectId as Id<"projects">;
  const [now] = useState(() => Date.now());
  const summary = useQuery(api.portal.getProjectSummary, { projectId: id, now });
  const hierarchy = useQuery(api.portal.getProjectHierarchy, { projectId: id });
  const [towerId, setTowerId] = useState<string | null>(null);
  const [floor, setFloor] = useState<Floor | null>(null);

  const towers = useMemo(() => (hierarchy && "towers" in hierarchy ? hierarchy.towers : []), [hierarchy]);
  const tower = towers.find((t) => t._id === towerId) ?? towers[0] ?? null;
  const floors = useMemo(() => [...(tower?.floors ?? [])].sort((a, b) => b.number - a.number), [tower]);

  if (summary === undefined) return <LoadingState />;
  const st = summary.status ? PROJECT_STATUS_CLIENT[summary.status] : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ ...header, title: summary.name }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.badges}>
          {st ? <Pill label={st.label} tone={st.tone} /> : null}
          {summary.endDate ? <Pill label={`Entrega prevista ${formatDate(summary.endDate)}`} dot={false} /> : null}
        </View>
        {summary.address ? <Text style={[type.bodySm, { color: colors.textSecondaryOnBg }]}>{summary.address}</Text> : null}
        <MetricStrip
          items={[
            { label: "Instalados", value: summary.installed, hint: `de ${summary.total}` },
            { label: "Andamento", value: `${summary.pct}%` },
            { label: "Em atraso", value: summary.overdue },
          ]}
        />
        <View style={styles.track}>
          <View style={[styles.bar, { width: `${Math.min(100, summary.pct)}%` }]} />
        </View>

        {hierarchy === undefined ? (
          <LoadingState />
        ) : towers.length === 0 ? (
          <EmptyState icon={<Building2 size={28} color={colors.primary} />} title="Estrutura ainda não cadastrada" description="Quando a engenharia montar as torres e os andares, o andamento por andar aparece aqui." />
        ) : (
          <>
            <SectionTitle title="Torres" />
            {towers.length > 1 ? (
              <Chips active={tower?._id ?? ""} onChange={setTowerId} style={{ paddingHorizontal: 0 }} items={towers.map((t) => ({ key: t._id, label: t.name }))} />
            ) : null}
            <Surface padded={false}>
              {floors.map((f, index) => {
                const overdue = f.environments.flatMap((e) => e.equipment).filter((e) => e.deadline !== null && e.deadline < now && e.status !== "operational").length;
                const pct = f.totalItems > 0 ? Math.round((f.installedItems / f.totalItems) * 100) : 0;
                return (
                  <Pressable key={f._id} onPress={() => setFloor(f)} accessibilityRole="button" style={({ pressed }) => [styles.floor, index > 0 && styles.border, pressed && { backgroundColor: colors.surfacePressed }]}>
                    <View style={styles.floorTile}>
                      <Text style={[type.bodyStrong, { color: colors.primary }]}>{f.label}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={[type.bodySm, { color: colors.text }]}>
                        {f.installedItems} de {f.totalItems} instalados
                      </Text>
                      <View style={styles.trackSm}>
                        <View style={[styles.bar, { width: `${pct}%` }]} />
                      </View>
                    </View>
                    {overdue > 0 ? <Pill label={`${overdue} em atraso`} tone="warning" /> : null}
                    <ChevronRight size={18} color={colors.icon} />
                  </Pressable>
                );
              })}
            </Surface>
          </>
        )}
      </ScrollView>

      <Sheet open={floor !== null} onClose={() => setFloor(null)} title={floor ? `${tower?.name ?? ""} · ${floor.label}` : ""} subtitle={floor ? `${floor.installedItems} de ${floor.totalItems} instalados` : undefined}>
        {floor ? (
          floor.environments.length === 0 ? (
            <Text style={[type.bodySm, { color: colors.textSecondary }]}>Nenhum ambiente neste andar.</Text>
          ) : (
            <View style={{ gap: space.md }}>
              {floor.environments.map((env) => (
                <Surface key={env._id} style={{ gap: space.sm }}>
                  <View style={styles.envHead}>
                    <Layers size={16} color={colors.icon} />
                    <Text style={[type.bodyStrong, { color: colors.text, flex: 1 }]}>{env.name}</Text>
                  </View>
                  {env.equipment.length === 0 ? (
                    <Text style={[type.caption, { color: colors.textSecondary }]}>Sem equipamentos planejados.</Text>
                  ) : (
                    env.equipment.map((e) => {
                      const cs = CLIENT_STATUS[clientStatusOf(e)];
                      return (
                        <View key={e._id} style={styles.equip}>
                          <Text style={[type.bodySm, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                            {[e.kind === "condensadora" ? "Condensadora" : "Evaporadora", e.capacidade].filter(Boolean).join(" ")}
                          </Text>
                          <Pill label={cs.label} tone={cs.tone} />
                        </View>
                      );
                    })
                  )}
                </Surface>
              ))}
            </View>
          )
        ) : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.screen, paddingBottom: 48, gap: space.md },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: colors.track, overflow: "hidden" },
  trackSm: { height: 6, borderRadius: radius.pill, backgroundColor: colors.track, overflow: "hidden" },
  bar: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.primary },
  floor: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 60 },
  border: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  floorTile: { minWidth: 48, height: 36, borderRadius: radius.sm, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", paddingHorizontal: space.sm },
  envHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  equip: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
