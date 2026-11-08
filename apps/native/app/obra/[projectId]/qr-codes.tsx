import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { usePaginatedQuery, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { History, QrCode } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";

import { StatusBadge } from "@/components/engenharia/status-badge";
import { Chips, EmptyState, LoadingState, Pill, PickerField, SearchField, Surface } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { colors, space, type } from "@/lib/theme";

type Tab = "etiquetas" | "servicos";

/** QR e serviços da obra (ficha O16): etiquetas e o que o campo registrou, por técnico. */
export default function ObraQrScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const [tab, setTab] = useState<Tab>("etiquetas");
  return (
    <View style={{ flex: 1 }}>
      <Chips<Tab>
        active={tab}
        onChange={setTab}
        style={{ paddingHorizontal: space.screen, paddingTop: space.lg }}
        items={[
          { key: "etiquetas", label: "Etiquetas" },
          { key: "servicos", label: "Serviços do campo" },
        ]}
      />
      {tab === "etiquetas" ? <Tags projectId={projectId as Id<"projects">} /> : <Activity projectId={projectId as Id<"projects">} />}
    </View>
  );
}

function Tags({ projectId }: { projectId: Id<"projects"> }) {
  const router = useRouter();
  const qrCodes = useQuery(api.qrCodes.listByProject, { projectId });
  const [search, setSearch] = useState("");
  const list = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return (qrCodes ?? []).filter(
      (q) => !term || [q.token, q.description, q.ambiente, q.modelo, q.environmentName, q.batchName].some((v) => v?.toLocaleLowerCase("pt-BR").includes(term))
    );
  }, [qrCodes, search]);

  if (qrCodes === undefined) return <LoadingState message="Carregando etiquetas…" />;
  const linked = qrCodes.filter((q) => q.equipmentId).length;

  return (
    <FlatList
      data={list}
      keyExtractor={(q) => q._id}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={{ gap: space.sm, marginBottom: space.xs }}>
          <SearchField value={search} onChangeText={setSearch} placeholder="Código, ambiente ou modelo" autoCapitalize="characters" />
          <Text style={[type.caption, { color: colors.textSecondaryOnBg }]}>
            {qrCodes.length} {qrCodes.length === 1 ? "etiqueta" : "etiquetas"} · {linked} com equipamento cadastrado
          </Text>
        </View>
      }
      renderItem={({ item }) => {
        const title = item.description ?? ([item.kind === "condensadora" ? "Condensadora" : item.kind === "evaporadora" ? "Evaporadora" : null, item.capacidade].filter(Boolean).join(" ") || "Etiqueta livre");
        const where = [item.towerName, item.floorLabel, item.environmentName ?? item.ambiente].filter(Boolean).join(" · ");
        return (
          <Surface onPress={() => router.push(`/equipamento/${item.token}` as Href)} accessibilityLabel={`${title}, etiqueta ${item.token}`}>
            <View style={styles.row}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                  {title}
                </Text>
                <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                  {[item.token, where || item.batchName].filter(Boolean).join(" · ")}
                </Text>
              </View>
              {item.status ? <StatusBadge status={item.status} /> : item.equipmentId ? null : <Pill label="Livre" dot={false} />}
            </View>
          </Surface>
        );
      }}
      ListEmptyComponent={<EmptyState icon={<QrCode size={28} color={colors.primary} />} title={search ? "Nada com essa busca" : "Nenhuma etiqueta nesta obra"} description={search ? undefined : "Vincule um lote de etiquetas à obra em Engenharia › QR codes."} />}
    />
  );
}

function Activity({ projectId }: { projectId: Id<"projects"> }) {
  const router = useRouter();
  const users = useQuery(api.technicianActivity.listActivityUsers, {});
  const [userId, setUserId] = useState<string | null>(null);
  const { results, status, loadMore } = usePaginatedQuery(
    api.technicianActivity.listProjectActivity,
    { projectId, userId: (userId as Id<"users"> | null) ?? undefined },
    { initialNumItems: 30 }
  );

  return (
    <FlatList
      data={results}
      keyExtractor={(i) => `${i.kind}:${i.id}`}
      contentContainerStyle={styles.list}
      onEndReachedThreshold={0.4}
      onEndReached={() => status === "CanLoadMore" && loadMore(30)}
      ListHeaderComponent={
        users ? (
          <PickerField
            label="Técnico"
            value={userId}
            onChange={setUserId}
            options={users.map((u) => ({ value: u._id as string, label: u.name }))}
            searchable
            clearable
            placeholder="Todos os técnicos"
            containerStyle={{ marginBottom: space.sm }}
          />
        ) : null
      }
      renderItem={({ item }) => {
        const token = item.qrToken;
        const body = (
          <View style={styles.row}>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                {item.title}
              </Text>
              <View style={styles.meta}>
                <Pill label={item.label} dot={false} />
                <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                  {[item.authorName, formatDateTime(item.createdAt)].filter(Boolean).join(" · ")}
                </Text>
              </View>
              {item.notes ? <Text style={[type.bodySm, { color: colors.textSecondary }]} numberOfLines={2}>{item.notes}</Text> : null}
            </View>
            {item.status ? <StatusBadge status={item.status} /> : null}
          </View>
        );
        return token ? (
          <Surface onPress={() => router.push(`/equipamento/${token}` as Href)}>{body}</Surface>
        ) : (
          <Surface>{body}</Surface>
        );
      }}
      ListEmptyComponent={status === "LoadingFirstPage" ? <LoadingState /> : <EmptyState icon={<History size={28} color={colors.primary} />} title="Nenhum serviço registrado" description="Cadastros, instalações e manutenções feitos pelo app de campo aparecem aqui." />}
      ListFooterComponent={status === "LoadingMore" ? <ActivityIndicator color={colors.primary} style={{ paddingVertical: space.lg }} /> : null}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: space.screen, paddingBottom: 48, gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm },
});
