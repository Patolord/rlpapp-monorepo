import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatCurrency, formatDate } from "@rlpapp/shared";
import { EmptyState, LoadingState } from "@rlpapp/ui/native";
import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { Ruler } from "lucide-react-native";
import { ScrollView, Text, View } from "react-native";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const MEDICAO_STATUS: Record<string, { label: string; cls: string; textCls: string }> = {
  rascunho: { label: "Rascunho", cls: "bg-muted border-border", textCls: "text-foreground" },
  aprovada: { label: "Aprovada", cls: "bg-green-100 border-green-300", textCls: "text-green-800" },
  paga: { label: "Paga", cls: "bg-emerald-100 border-emerald-300", textCls: "text-emerald-800" },
};

export default function MedicoesScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();

  const medicoes = useQuery(api.medicoes.listMedicoes, {
    projectId: projectId as Id<"projects">,
  });

  const progress = useQuery(api.medicoes.getProgress, {
    projectId: projectId as Id<"projects">,
  });

  if (medicoes === undefined) {
    return <LoadingState label="Carregando medições…" />;
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      {progress && (
        <Card className="gap-2 p-4">
          <Text className="text-sm font-semibold text-foreground">
            Progresso da Instalação
          </Text>
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-muted-foreground">
              {progress.installedItems}/{progress.totalItems} equipamentos
            </Text>
            <Text className="text-lg font-bold text-primary">
              {progress.percent}%
            </Text>
          </View>
          <View className="h-2 overflow-hidden rounded-full bg-muted">
            <View
              className="h-full rounded-full bg-primary"
              style={{ width: `${progress.percent}%` }}
            />
          </View>
        </Card>
      )}

      <Text className="text-lg font-bold text-foreground">Medições</Text>

      {medicoes.length === 0 ? (
        <EmptyState
          icon={<Ruler size={24} color="#f59e0b" />}
          title="Sem medições"
          description="Nenhuma medição registrada para esta obra."
        />
      ) : (
        medicoes.map((m) => {
          const statusCfg = MEDICAO_STATUS[m.status] ?? MEDICAO_STATUS.rascunho;
          return (
            <Card key={m._id} className="gap-2 p-4">
              <View className="flex-row items-start justify-between gap-2">
                <View className="min-w-0 flex-1">
                  <Text className="text-base font-semibold text-foreground">
                    Medição nº {m.sequence}
                  </Text>
                  <Text className="text-sm text-muted-foreground">
                    {m.contractTitle}
                  </Text>
                </View>
                <View
                  className={cn(
                    "rounded-full border px-2.5 py-0.5",
                    statusCfg.cls
                  )}
                >
                  <Text
                    className={cn("text-xs font-medium", statusCfg.textCls)}
                  >
                    {statusCfg.label}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-base font-bold text-foreground">
                  {formatCurrency(m.amountCents)}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {formatDate(m.referenceDate)}
                </Text>
              </View>
              {m.description && (
                <Text
                  className="text-sm text-muted-foreground"
                  numberOfLines={2}
                >
                  {m.description}
                </Text>
              )}
            </Card>
          );
        })
      )}
    </ScrollView>
  );
}
