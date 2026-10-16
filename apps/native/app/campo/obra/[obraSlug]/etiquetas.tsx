import { api } from "@rlpapp/backend/convex/_generated/api";
import { usePaginatedQuery } from "convex/react";
import { useRouter, type Href } from "expo-router";
import { MapPin, QrCode } from "lucide-react-native";
import { useEffect, useState } from "react";
import { FlatList, Platform, StyleSheet, Text, View } from "react-native";

import { obraTitle, useFieldObra } from "@/components/campo/obra-context";
import {
  AppButton,
  Chips,
  EmptyState,
  LoadingState,
  Pill,
  Screen,
  ScreenHeader,
  SearchField,
  Surface,
  screenStyles,
} from "@/components/ui";
import { EQUIPMENT_STATUS_LABELS, type EquipmentStatus } from "@/lib/equipment-status";
import { colors, space, type, type Tone } from "@/lib/theme";

type QrFilter = "all" | "registered" | "free";

const STATUS_TONE: Record<EquipmentStatus, Tone> = {
  installing: "info",
  operational: "success",
  warning: "warning",
  error: "danger",
};

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/** Etiquetas QR da obra (cadastradas e livres), com busca e filtro. */
export default function CampoObraEtiquetasScreen() {
  const router = useRouter();
  const { obra } = useFieldObra();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<QrFilter>("all");
  const debouncedSearch = useDebounced(search.trim(), 300);

  const { results, status, loadMore } = usePaginatedQuery(
    api.technicianPortal.listBrowsableQrsByProject,
    { projectId: obra._id, search: debouncedSearch || undefined, filter },
    { initialNumItems: 20 }
  );
  const searching = debouncedSearch.length > 0;

  const emptyMessage = searching
    ? "Nenhuma etiqueta corresponde à busca."
    : filter === "registered"
      ? "Nenhuma etiqueta cadastrada nesta obra."
      : filter === "free"
        ? "Nenhuma etiqueta livre nesta obra."
        : "Nenhuma etiqueta ativa nesta obra.";

  return (
    <Screen>
      <ScreenHeader title="Etiquetas QR" subtitle={obraTitle(obra)} onBack={() => router.back()} />
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Código, ambiente ou equipamento"
        containerStyle={{ marginHorizontal: space.screen, marginBottom: space.md }}
      />
      <Chips<QrFilter>
        active={filter}
        onChange={setFilter}
        items={[
          { key: "all", label: "Todas", count: obra.qrCount },
          { key: "registered", label: "Cadastradas", count: obra.registeredCount },
          { key: "free", label: "Livres", count: obra.qrCount - obra.registeredCount },
        ]}
      />

      {status === "LoadingFirstPage" ? (
        <LoadingState message="Carregando etiquetas..." />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item._id}
          contentContainerStyle={[screenStyles.content, { paddingTop: space.lg }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (status === "CanLoadMore") loadMore(20);
          }}
          ListEmptyComponent={
            <EmptyState
              icon={<QrCode size={30} color={colors.primary} strokeWidth={1.8} />}
              title="Nenhuma etiqueta"
              description={emptyMessage}
            />
          }
          ListFooterComponent={
            status === "CanLoadMore" ? (
              <AppButton label="Carregar mais" variant="secondary" size="sm" onPress={() => loadMore(20)} />
            ) : status === "LoadingMore" ? (
              <LoadingState style={{ flex: 0, paddingVertical: space.lg }} />
            ) : null
          }
          renderItem={({ item }) => {
            const title =
              item.description ||
              [item.modelo, item.ambiente].filter(Boolean).join(" · ") ||
              "Etiqueta ainda sem equipamento";
            return (
              <Surface
                onPress={() => router.push(`/equipamento/${item.token}` as Href)}
                style={styles.row}
                padded={false}
              >
                <View style={styles.icon}>
                  <QrCode size={22} color={colors.primary} strokeWidth={1.8} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.tokenRow}>
                    <Text style={styles.token}>{item.token}</Text>
                    {item.status ? (
                      <Pill label={EQUIPMENT_STATUS_LABELS[item.status]} tone={STATUS_TONE[item.status]} />
                    ) : (
                      <Pill label="Livre" tone="neutral" />
                    )}
                  </View>
                  <Text style={[type.bodySm, { color: colors.text }]} numberOfLines={2}>
                    {title}
                  </Text>
                  {item.ambiente ? (
                    <View style={styles.place}>
                      <MapPin size={12} color={colors.textMuted} />
                      <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
                        {item.ambiente}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Surface>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    padding: space.lg,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  tokenRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.sm },
  token: {
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
    letterSpacing: 0.5,
  },
  place: { flexDirection: "row", alignItems: "center", gap: 4 },
});
