import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatCurrency } from "@rlpapp/shared";
import { EmptyState, LoadingState } from "@rlpapp/ui/native";
import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { FileText } from "lucide-react-native";
import { ScrollView, Text, View } from "react-native";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const DIRECTION_LABELS: Record<string, string> = {
  client_sale: "Venda ao Cliente",
  subcontractor_purchase: "Subempreitada",
};

const KIND_LABELS: Record<string, string> = {
  base: "Base",
  addendum: "Aditivo",
};

export default function ContratosScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();

  const contracts = useQuery(api.contracts.list, {
    projectId: projectId as Id<"projects">,
  });

  if (contracts === undefined) {
    return <LoadingState label="Carregando contratos…" />;
  }

  if (!contracts || contracts.length === 0) {
    return (
      <EmptyState
        icon={<FileText size={24} color="#f59e0b" />}
        title="Sem contratos"
        description="Nenhum contrato vinculado a esta obra."
        variant="plain"
        className="flex-1"
      />
    );
  }

  const totalCents = contracts.reduce((sum, c) => sum + c.valueCents, 0);

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      <Card className="gap-2 p-4">
        <Text className="text-sm font-semibold text-foreground">
          Resumo de Contratos
        </Text>
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-muted-foreground">
            {contracts.length} contrato{contracts.length === 1 ? "" : "s"}
          </Text>
          <Text className="text-lg font-bold text-foreground">
            {formatCurrency(totalCents)}
          </Text>
        </View>
      </Card>

      {contracts.map((contract) => (
        <Card key={contract._id} className="gap-2 p-4">
          <View className="flex-row items-start justify-between gap-2">
            <View className="flex-row items-center gap-2.5 flex-1 min-w-0">
              <View className="h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <FileText size={20} color="#eab308" />
              </View>
              <View className="min-w-0 flex-1">
                <Text
                  className="text-base font-semibold text-foreground"
                  numberOfLines={1}
                >
                  {contract.title}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  {DIRECTION_LABELS[contract.direction] ?? contract.direction}
                  {" · "}
                  {KIND_LABELS[contract.kind] ?? contract.kind}
                </Text>
              </View>
            </View>
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-bold text-foreground">
              {formatCurrency(contract.valueCents)}
            </Text>
            {(contract.customerName ?? contract.contractorName) && (
              <Text
                className="text-xs text-muted-foreground"
                numberOfLines={1}
              >
                {contract.customerName ?? contract.contractorName}
              </Text>
            )}
          </View>
          {contract.notes && (
            <Text
              className="text-sm text-muted-foreground"
              numberOfLines={2}
            >
              {contract.notes}
            </Text>
          )}
        </Card>
      ))}
    </ScrollView>
  );
}
