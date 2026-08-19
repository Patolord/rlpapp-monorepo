import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { EmptyState, LoadingState } from "@rlpapp/ui/native";
import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { Link2, QrCode, Unlink } from "lucide-react-native";
import { ScrollView, Text, View } from "react-native";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export default function QrCodesScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();

  const qrCodes = useQuery(api.qrCodes.listByProject, {
    projectId: projectId as Id<"projects">,
  });

  if (qrCodes === undefined) {
    return <LoadingState label="Carregando QR codes…" />;
  }

  if (!qrCodes || qrCodes.length === 0) {
    return (
      <EmptyState
        icon={<QrCode size={24} color="#f59e0b" />}
        title="Sem QR codes"
        description="Nenhum QR code vinculado a esta obra."
        variant="plain"
        className="flex-1"
      />
    );
  }

  const linked = qrCodes.filter((qr) => qr.plannedItemId);
  const unlinked = qrCodes.filter((qr) => !qr.plannedItemId);

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      <Card className="gap-2 p-4">
        <Text className="text-sm font-semibold text-foreground">
          Resumo de QR Codes
        </Text>
        <View className="flex-row gap-4">
          <View className="flex-1 items-center gap-1">
            <Text className="text-2xl font-bold text-foreground">
              {qrCodes.length}
            </Text>
            <Text className="text-xs text-muted-foreground">Total</Text>
          </View>
          <View className="flex-1 items-center gap-1">
            <Text className="text-2xl font-bold text-green-600">
              {linked.length}
            </Text>
            <Text className="text-xs text-muted-foreground">Vinculados</Text>
          </View>
          <View className="flex-1 items-center gap-1">
            <Text className="text-2xl font-bold text-amber-500">
              {unlinked.length}
            </Text>
            <Text className="text-xs text-muted-foreground">Livres</Text>
          </View>
        </View>
      </Card>

      {qrCodes.map((qr) => (
        <Card key={qr._id} className="gap-2 p-3">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              {qr.plannedItemId ? (
                <Link2 size={16} color="#10b981" />
              ) : (
                <Unlink size={16} color="#d97706" />
              )}
              <Text className="text-sm font-mono font-semibold text-foreground">
                {qr.token}
              </Text>
            </View>
            <Badge
              variant={qr.plannedItemId ? "default" : "secondary"}
            >
              {qr.plannedItemId ? "Vinculado" : "Livre"}
            </Badge>
          </View>

          {(qr.system ?? qr.ambiente) && (
            <Text className="text-xs text-muted-foreground">
              {[qr.system, qr.ambiente].filter(Boolean).join(" · ")}
            </Text>
          )}

          {(qr.towerName ?? qr.floorLabel ?? qr.environmentName) && (
            <Text className="text-xs text-muted-foreground">
              {[qr.towerName, qr.floorLabel, qr.environmentName]
                .filter(Boolean)
                .join(" → ")}
            </Text>
          )}

          {qr.batchName && (
            <Text className="text-xs text-muted-foreground">
              Lote: {qr.batchName}
            </Text>
          )}
        </Card>
      ))}
    </ScrollView>
  );
}
