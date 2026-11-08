import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { usePaginatedQuery } from "convex/react";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { ChevronRight, Clock, History } from "lucide-react-native";
import { FlatList, Pressable, Text, View } from "react-native";

import { Badge, EmptyState, LoadingState } from "@rlpapp/ui/native";
import { PendingBanner } from "@/components/campo/pending-banner";
import { StatusBadge } from "@/components/engenharia/status-badge";
import { Card } from "@/components/ui/card";

/** Serviços e cadastros do usuário logado nesta obra. */
export default function ObraRegistrosScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();

  const { results, status, loadMore } = usePaginatedQuery(
    api.technicianActivity.listMineForProject,
    { projectId: projectId as Id<"projects"> },
    { initialNumItems: 20 }
  );

  if (status === "LoadingFirstPage") {
    return <LoadingState label="Carregando registros…" />;
  }

  return (
    <FlatList
      data={results}
      keyExtractor={(item) => `${item.kind}:${item.id}`}
      contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 8 }}
      ListHeaderComponent={
        <View className="pb-2">
          <PendingBanner onPress={() => router.push("/campo/pendentes" as Href)} />
        </View>
      }
      onEndReached={() => {
        if (status === "CanLoadMore") loadMore(20);
      }}
      onEndReachedThreshold={0.5}
      renderItem={({ item }) => {
        const content = (
          <Card className="gap-2 p-4">
            <View className="flex-row items-start justify-between gap-2">
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="font-medium text-foreground" numberOfLines={1}>
                  {item.title}
                </Text>
                <View className="flex-row flex-wrap items-center gap-2">
                  <Badge variant="neutral">{item.label}</Badge>
                  {item.qrToken ? (
                    <Text className="font-mono text-xs text-muted-foreground">
                      {item.qrToken}
                    </Text>
                  ) : null}
                </View>
              </View>
              {item.status ? <StatusBadge status={item.status} /> : null}
            </View>
            {item.notes ? (
              <Text className="text-xs text-muted-foreground" numberOfLines={2}>
                {item.notes}
              </Text>
            ) : null}
            <View className="flex-row items-center gap-2">
              <Clock size={12} color="#9ca3af" />
              <Text className="flex-1 text-xs text-muted-foreground">
                {new Date(item.createdAt).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
              {item.qrToken ? <ChevronRight size={14} color="#9ca3af" /> : null}
            </View>
          </Card>
        );

        if (!item.qrToken) return content;
        const token = item.qrToken;
        return (
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/campo/obra/[projectId]/equipamento/[token]",
                params: { projectId: projectId!, token },
              })
            }
            accessibilityRole="button"
          >
            {content}
          </Pressable>
        );
      }}
      ListEmptyComponent={
        <EmptyState
          icon={<History size={28} color="#10b981" />}
          title="Sem registros nesta obra"
          description="Os serviços que você registrar aqui aparecem nesta lista."
        />
      }
      ListFooterComponent={
        status === "LoadingMore" ? <LoadingState size="small" className="py-4" /> : null
      }
    />
  );
}
