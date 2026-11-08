import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { usePaginatedQuery } from "convex/react";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { ChevronRight, History } from "lucide-react-native";
import { useMemo } from "react";
import { ActivityIndicator, SectionList, StyleSheet, Text, View } from "react-native";

import { PendingBanner } from "@/components/campo/pending-banner";
import { StatusBadge } from "@/components/engenharia/status-badge";
import { EmptyState, LoadingState, Pill, Surface } from "@/components/ui";
import { colors, space, type } from "@/lib/theme";

type Item = FunctionReturnType<typeof api.technicianActivity.listMineForProject>["page"][number];

function dayTitle(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(today) - start(d)) / 86_400_000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Ontem";
  const label = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Meus registros nesta obra (ficha C8), agrupados por dia. */
export default function ObraRegistrosScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();
  const { results, status, loadMore } = usePaginatedQuery(
    api.technicianActivity.listMineForProject,
    { projectId: projectId as Id<"projects"> },
    { initialNumItems: 20 }
  );

  const sections = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of results) {
      const key = dayTitle(item.createdAt);
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return [...map.entries()].map(([title, data]) => ({ title, data }));
  }, [results]);

  if (status === "LoadingFirstPage") return <LoadingState message="Carregando registros…" />;

  return (
    <SectionList
      style={{ backgroundColor: colors.bg }}
      sections={sections}
      keyExtractor={(item) => `${item.kind}:${item.id}`}
      contentContainerStyle={styles.list}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={<PendingBanner onPress={() => router.push("/campo/pendentes" as Href)} />}
      onEndReached={() => {
        if (status === "CanLoadMore") loadMore(20);
      }}
      onEndReachedThreshold={0.5}
      renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
      renderItem={({ item }) => {
        const token = item.qrToken;
        const time = new Date(item.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        const content = (
          <View style={styles.row}>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                {item.title}
              </Text>
              <View style={styles.meta}>
                <Pill label={item.label} dot={false} />
                <Text style={styles.metaText}>
                  {time}
                  {token ? ` · Etiqueta ${token}` : ""}
                </Text>
              </View>
              {item.notes ? (
                <Text style={styles.metaText} numberOfLines={2}>
                  {item.notes}
                </Text>
              ) : null}
            </View>
            {item.status ? <StatusBadge status={item.status} /> : null}
            {token ? <ChevronRight size={18} color={colors.icon} /> : null}
          </View>
        );
        if (!token) return <Surface style={styles.card}>{content}</Surface>;
        return (
          <Surface
            style={styles.card}
            accessibilityLabel={`${item.title}, ${item.label}, ${time}`}
            onPress={() =>
              router.push({ pathname: "/campo/obra/[projectId]/equipamento/[token]", params: { projectId: projectId!, token } })
            }
          >
            {content}
          </Surface>
        );
      }}
      ListEmptyComponent={
        <EmptyState
          icon={<History size={28} color={colors.primary} />}
          title="Nada registrado nesta obra"
          description="Os cadastros e serviços que você enviar aqui aparecem nesta lista."
        />
      }
      ListFooterComponent={status === "LoadingMore" ? <ActivityIndicator color={colors.primary} style={{ paddingVertical: space.lg }} /> : null}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: space.screen, paddingBottom: 40, gap: space.sm },
  section: { ...type.eyebrow, color: colors.textSecondaryOnBg, marginTop: space.md, marginBottom: space.xs },
  card: { marginBottom: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm },
  metaText: { ...type.bodySm, color: colors.textSecondary },
});
