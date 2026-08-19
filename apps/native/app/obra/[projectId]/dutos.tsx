import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { EmptyState, LoadingState } from "@rlpapp/ui/native";
import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { Wind } from "lucide-react-native";
import { ScrollView, Text, View } from "react-native";

import { Card } from "@/components/ui/card";

export default function DutosScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();

  const estimates = useQuery(api.ductEstimates.list, {
    projectId: projectId as Id<"projects">,
  });

  if (estimates === undefined) {
    return <LoadingState label="Carregando levantamentos de dutos…" />;
  }

  if (!estimates || estimates.length === 0) {
    return (
      <EmptyState
        icon={<Wind size={24} color="#f59e0b" />}
        title="Sem levantamentos de dutos"
        description="Nenhum levantamento de dutos cadastrado para esta obra."
        variant="plain"
        className="flex-1"
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      <Text className="text-lg font-bold text-foreground">
        Levantamentos de Dutos
      </Text>

      {estimates.map((est) => (
        <Card key={est._id} className="gap-2 p-4">
          <View className="flex-row items-start justify-between gap-2">
            <View className="flex-row items-center gap-2.5 flex-1 min-w-0">
              <View className="h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Wind size={20} color="#0ea5e9" />
              </View>
              <View className="min-w-0 flex-1">
                <Text
                  className="text-base font-semibold text-foreground"
                  numberOfLines={1}
                >
                  {est.name}
                </Text>
                {est.system ? (
                  <Text className="text-sm text-muted-foreground">
                    Sistema: {est.system}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-muted-foreground">
              {est.lineCount} {est.lineCount === 1 ? "trecho" : "trechos"}
            </Text>
            {est.budgetNumber ? (
              <Text className="text-xs text-muted-foreground">
                Orçamento: {est.budgetNumber}
              </Text>
            ) : null}
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}
