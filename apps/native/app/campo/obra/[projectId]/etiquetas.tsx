import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { usePaginatedQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { QrCode, Search } from "lucide-react-native";
import { useEffect, useState } from "react";
import { FlatList, StyleSheet, TextInput, View } from "react-native";

import { EmptyState, LoadingState } from "@rlpapp/ui/native";
import { BigRow, StatusPill } from "@/components/campo/field-ui";
import { EQUIPMENT_STATUS_LABELS, type EquipmentStatus } from "@/lib/equipment-status";
import { colors, radius, space, type Tone } from "@/lib/theme";

const STATUS_TONE: Record<EquipmentStatus, Tone> = {
  installing: "info",
  operational: "success",
  warning: "warning",
  error: "danger",
};

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Equipamentos (etiquetas QR) da obra: busca e uma linha grande por item. */
export default function ObraEtiquetasScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  const { results, status, loadMore } = usePaginatedQuery(
    api.technicianPortal.listBrowsableQrsByProject,
    {
      projectId: projectId as Id<"projects">,
      search: debouncedSearch || undefined,
      filter: "all",
    },
    { initialNumItems: 30 }
  );

  return (
    <View style={styles.screen}>
      <View style={styles.searchWrap}>
        <View style={styles.search}>
          <Search size={24} color={colors.icon} strokeWidth={2.2} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel="Buscar equipamento"
          />
        </View>
      </View>

      {status === "LoadingFirstPage" ? (
        <LoadingState label="Carregando…" />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          onEndReached={() => {
            if (status === "CanLoadMore") loadMore(30);
          }}
          onEndReachedThreshold={0.5}
          renderItem={({ item }) => (
            <BigRow
              title={item.equipmentId ? (item.description ?? item.token) : "Etiqueta livre"}
              subtitle={item.equipmentId ? item.ambiente : item.token}
              trailing={
                !item.equipmentId ? (
                  <StatusPill label="Cadastrar" tone="neutral" />
                ) : item.status ? (
                  <StatusPill label={EQUIPMENT_STATUS_LABELS[item.status]} tone={STATUS_TONE[item.status]} />
                ) : undefined
              }
              onPress={() =>
                router.push({
                  pathname: "/campo/obra/[projectId]/equipamento/[token]",
                  params: { projectId: projectId!, token: item.token },
                })
              }
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon={<QrCode size={28} color={colors.primary} />}
              title="Nada aqui"
              description={debouncedSearch ? "Nenhum resultado." : "Sem etiquetas nesta obra."}
            />
          }
          ListFooterComponent={
            status === "LoadingMore" ? <LoadingState size="small" className="py-4" /> : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  searchWrap: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm },
  search: {
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, fontSize: 18, fontWeight: "500", color: colors.text },
  list: { padding: space.lg, paddingTop: space.sm, paddingBottom: 48, gap: space.md },
});
