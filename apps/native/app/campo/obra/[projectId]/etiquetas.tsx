import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { usePaginatedQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronRight, Link2, QrCode, Search, Unlink } from "lucide-react-native";
import { useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

import { EmptyState, LoadingState } from "@rlpapp/ui/native";
import { StatusBadge } from "@/components/engenharia/status-badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAppTheme } from "@/contexts/app-theme-context";

type QrFilter = "all" | "registered" | "free";

const FILTERS: { key: QrFilter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "registered", label: "Cadastradas" },
  { key: "free", label: "Livres" },
];

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Etiquetas QR da obra, com busca e filtro no servidor. */
export default function ObraEtiquetasScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();
  const { isDark } = useAppTheme();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<QrFilter>("all");
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  const { results, status, loadMore } = usePaginatedQuery(
    api.technicianPortal.listBrowsableQrsByProject,
    {
      projectId: projectId as Id<"projects">,
      search: debouncedSearch || undefined,
      filter,
    },
    { initialNumItems: 30 }
  );

  const chipBg = isDark ? "#1e293b" : "#e2e8f0";
  const chipText = isDark ? "#94a3b8" : "#64748b";

  return (
    <View className="flex-1">
      <View className="gap-3 px-5 pb-2 pt-4">
        <View className="flex-row items-center gap-2 rounded-lg border border-input bg-card px-3">
          <Search size={16} color="#9ca3af" />
          <Input
            className="h-12 flex-1 border-0 bg-transparent px-0 text-base"
            placeholder="Código, descrição, ambiente ou lote"
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
        </View>
        <View className="flex-row gap-2">
          {FILTERS.map((f) => {
            const active = f.key === filter;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 20,
                  backgroundColor: active ? "#f59e0b" : chipBg,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: active ? "700" : "500",
                    color: active ? "#000" : chipText,
                  }}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {status === "LoadingFirstPage" ? (
        <LoadingState label="Carregando etiquetas…" />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40, gap: 8 }}
          keyboardShouldPersistTaps="handled"
          onEndReached={() => {
            if (status === "CanLoadMore") loadMore(30);
          }}
          onEndReachedThreshold={0.5}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/campo/obra/[projectId]/equipamento/[token]",
                  params: { projectId: projectId!, token: item.token },
                })
              }
              accessibilityRole="button"
            >
              <Card className="gap-1.5 p-4">
                <View className="flex-row items-center justify-between gap-2">
                  <View className="min-w-0 flex-1 flex-row items-center gap-2">
                    {item.equipmentId ? (
                      <Link2 size={16} color="#10b981" />
                    ) : (
                      <Unlink size={16} color="#d97706" />
                    )}
                    <Text className="font-mono text-sm font-semibold text-foreground">
                      {item.token}
                    </Text>
                  </View>
                  {item.status ? (
                    <StatusBadge status={item.status} />
                  ) : (
                    <Text className="text-xs text-muted-foreground">Livre</Text>
                  )}
                  <ChevronRight size={16} color="#9ca3af" />
                </View>
                {item.description ? (
                  <Text className="text-sm text-foreground" numberOfLines={1}>
                    {item.description}
                  </Text>
                ) : null}
                {(item.ambiente || item.modelo || item.batchName) ? (
                  <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                    {[item.ambiente, item.modelo, item.batchName && `Lote: ${item.batchName}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                ) : null}
              </Card>
            </Pressable>
          )}
          ListEmptyComponent={
            <EmptyState
              icon={<QrCode size={28} color="#d97706" />}
              title="Nenhuma etiqueta"
              description={
                debouncedSearch
                  ? "Nenhuma etiqueta corresponde à busca."
                  : "Esta obra ainda não tem etiquetas QR."
              }
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
