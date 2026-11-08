import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { usePaginatedQuery, useQuery } from "convex/react";
import { useRouter, type Href } from "expo-router";
import { Building2, ChevronRight, History } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, View } from "react-native";

import { PendingBanner } from "@/components/campo/pending-banner";
import { StatusBadge } from "@/components/engenharia/status-badge";
import { EmptyState, LoadingState, Pill, PickerField, Sheet, Surface } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { colors, radius, space, type } from "@/lib/theme";

type ProjectRow = FunctionReturnType<typeof api.technicianActivity.listMineProjects>[number];

/**
 * Meus registros (ficha G8): o que a pessoa enviou do campo, agrupado por obra.
 * Quem pode ver os outros escolhe o técnico. Também abre em Mais › Meus registros
 * para o técnico.
 */
export default function MeusRegistrosScreen() {
  const router = useRouter();
  const users = useQuery(api.technicianActivity.listActivityUsers, {});
  const [userId, setUserId] = useState<string | null>(null);
  const projects = useQuery(api.technicianActivity.listMineProjects, { userId: (userId as Id<"users"> | null) ?? undefined });
  const [open, setOpen] = useState<ProjectRow | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={projects ?? []}
        keyExtractor={(p) => p.projectId ?? "sem-obra"}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <PendingBanner onPress={() => router.push("/pendentes" as Href)} />
            {users ? (
              <PickerField
                label="Técnico"
                value={userId}
                onChange={setUserId}
                options={users.map((u) => ({ value: u._id as string, label: u.name, description: u.isActive ? null : "desativado" }))}
                searchable
                clearable
                placeholder="Meus registros"
              />
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <Surface onPress={() => setOpen(item)} accessibilityLabel={`${item.projectName ?? "Sem obra"}, ${item.count} registros`}>
            <View style={styles.row}>
              <View style={styles.tile}>
                <Building2 size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                  {item.projectName ?? "Sem obra"}
                </Text>
                <Text style={[type.caption, { color: colors.textSecondary }]}>
                  {item.count} {item.count === 1 ? "registro" : "registros"} · último {formatDateTime(item.lastActivityAt)}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.icon} />
            </View>
          </Surface>
        )}
        ListEmptyComponent={
          projects === undefined ? (
            <LoadingState />
          ) : (
            <EmptyState icon={<History size={28} color={colors.primary} />} title="Nada registrado ainda" description="Cadastros, instalações e manutenções enviados pelo app aparecem aqui, separados por obra." />
          )
        }
      />
      <Sheet open={open !== null} onClose={() => setOpen(null)} title={open?.projectName ?? "Sem obra"} subtitle={open ? `${open.count} ${open.count === 1 ? "registro" : "registros"}` : undefined}>
        {open ? <ProjectActivity projectId={open.projectId} userId={(userId as Id<"users"> | null) ?? undefined} onOpen={(token) => { setOpen(null); router.push(`/equipamento/${token}` as Href); }} /> : null}
      </Sheet>
    </View>
  );
}

function ProjectActivity({ projectId, userId, onOpen }: { projectId: Id<"projects"> | null; userId?: Id<"users">; onOpen: (token: string) => void }) {
  const { results, status, loadMore } = usePaginatedQuery(api.technicianActivity.listMineForProject, { projectId, userId }, { initialNumItems: 30 });
  if (status === "LoadingFirstPage") return <LoadingState />;
  return (
    <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: space.sm }} onMomentumScrollEnd={() => status === "CanLoadMore" && loadMore(30)}>
      {results.map((item) => {
        const body = (
          <View style={styles.row}>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                {item.title}
              </Text>
              <View style={styles.meta}>
                <Pill label={item.label} dot={false} />
                <Text style={[type.caption, { color: colors.textSecondary }]}>{formatDateTime(item.createdAt)}</Text>
              </View>
              {item.notes ? <Text style={[type.bodySm, { color: colors.textSecondary }]} numberOfLines={2}>{item.notes}</Text> : null}
            </View>
            {item.status ? <StatusBadge status={item.status} /> : null}
          </View>
        );
        return item.qrToken ? (
          <Surface key={`${item.kind}:${item.id}`} onPress={() => onOpen(item.qrToken!)}>{body}</Surface>
        ) : (
          <Surface key={`${item.kind}:${item.id}`}>{body}</Surface>
        );
      })}
      {status === "LoadingMore" ? <ActivityIndicator color={colors.primary} /> : null}
      {status === "CanLoadMore" ? <Text style={[type.label, { color: colors.primary, textAlign: "center", paddingVertical: space.sm }]} onPress={() => loadMore(30)}>Carregar mais</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { padding: space.screen, paddingBottom: 48, gap: space.sm },
  header: { gap: space.md, marginBottom: space.xs },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  tile: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm },
});
