import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useRouter, type Href } from "expo-router";
import { Building2, MapPin } from "lucide-react-native";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { EmptyState, LoadingState, Pill, Surface } from "@/components/ui";
import { PROJECT_STATUS_CLIENT } from "@/lib/client-status";
import { colors, radius, space, type } from "@/lib/theme";

/** Minhas obras do cliente (ficha L1). */
export default function PortalHomeScreen() {
  const router = useRouter();
  const projects = useQuery(api.portal.listMyProjects);

  if (projects === undefined) return <LoadingState message="Carregando suas obras…" />;

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      data={projects}
      keyExtractor={(p) => p._id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => {
        const st = item.status ? PROJECT_STATUS_CLIENT[item.status] : null;
        return (
          <Surface onPress={() => router.push(`/portal-projeto/${item._id}` as Href)} style={{ gap: space.md }} accessibilityLabel={`${item.name}, ${item.pct}% instalado`}>
            <View style={styles.row}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.subtitle, { color: colors.text }]} numberOfLines={2}>
                  {item.name}
                </Text>
                {item.address ? (
                  <View style={styles.address}>
                    <MapPin size={14} color={colors.icon} />
                    <Text style={[type.bodySm, { color: colors.textSecondary, flex: 1 }]} numberOfLines={1}>
                      {item.address}
                    </Text>
                  </View>
                ) : null}
              </View>
              {st ? <Pill label={st.label} tone={st.tone} /> : null}
            </View>
            <View style={{ gap: space.xs }}>
              <View style={styles.track}>
                <View style={[styles.bar, { width: `${Math.min(100, item.pct)}%` }]} />
              </View>
              <Text style={[type.caption, { color: colors.textSecondary }]}>
                {item.pct}% instalado · {item.installed} de {item.total} equipamentos
              </Text>
            </View>
          </Surface>
        );
      }}
      ListEmptyComponent={
        <EmptyState
          icon={<Building2 size={28} color={colors.primary} />}
          title="Nenhuma obra liberada para você"
          description="Quando a RLP Engenharia liberar o acompanhamento de uma obra, ela aparece aqui."
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.screen, paddingTop: space.sm, paddingBottom: 48, gap: space.md },
  row: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  address: { flexDirection: "row", alignItems: "center", gap: 4 },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: colors.track, overflow: "hidden" },
  bar: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.primary },
});
