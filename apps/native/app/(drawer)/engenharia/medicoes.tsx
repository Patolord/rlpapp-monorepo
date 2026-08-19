import { api } from "@rlpapp/backend/convex/_generated/api";
import { formatCurrency } from "@rlpapp/shared";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { ArrowLeft, BarChart3 } from "lucide-react-native";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";

import { MedicaoCard } from "@/components/engenharia/medicao-card";
import { Card } from "@/components/ui/card";

export default function MedicoesScreen() {
  const router = useRouter();
  const overview = useQuery(api.medicoes.getOverview);

  const totalMedicoes = overview?.length ?? 0;
  const valorTotalCents =
    overview?.reduce((sum, p) => sum + p.medidoCents, 0) ?? 0;
  const pendentesAprovacao =
    overview?.filter((p) => p.medidoCents > p.aprovadoCents).length ?? 0;

  return (
    <View className="flex-1">
      <View className="flex-row items-center gap-3 px-5 pb-4 pt-5">
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          className="h-9 w-9 items-center justify-center rounded-full bg-card"
        >
          <ArrowLeft size={20} color="#9ca3af" />
        </Pressable>
        <View className="flex-1">
          <Text className="text-2xl font-bold text-foreground">Medições</Text>
          <Text className="text-sm text-muted-foreground">
            Visão geral de todas as medições
          </Text>
        </View>
      </View>

      {overview === undefined ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={overview}
          keyExtractor={(item) => item.projectId}
          contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 12 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View className="flex-row flex-wrap gap-3 mb-4">
              <StatCard label="Total de medições" value={String(totalMedicoes)} />
              <StatCard
                label="Valor total medido"
                value={formatCurrency(valorTotalCents)}
              />
              <StatCard
                label="Pendentes aprovação"
                value={String(pendentesAprovacao)}
              />
            </View>
          }
          ListEmptyComponent={
            <Card className="items-center gap-3 py-10">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <BarChart3 size={28} color="#f59e0b" />
              </View>
              <Text className="text-center text-base font-medium text-foreground">
                Nenhuma medição encontrada
              </Text>
              <Text className="px-6 text-center text-sm text-muted-foreground">
                As medições aparecerão aqui quando forem criadas.
              </Text>
            </Card>
          }
          renderItem={({ item }) => {
            const status =
              item.pagoCents >= item.medidoCents && item.medidoCents > 0
                ? "paid"
                : item.aprovadoCents >= item.medidoCents && item.medidoCents > 0
                  ? "approved"
                  : item.medidoCents > 0
                    ? "submitted"
                    : "draft";

            return (
              <MedicaoCard
                projectName={item.projectName}
                period={`${item.contractCount} contrato${item.contractCount === 1 ? "" : "s"}`}
                valueCents={item.medidoCents}
                status={status as "draft" | "submitted" | "approved" | "paid"}
              />
            );
          }}
        />
      )}
    </View>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="min-w-[30%] flex-1 p-3">
      <Text className="text-lg font-bold text-foreground">{value}</Text>
      <Text className="mt-0.5 text-xs text-muted-foreground">{label}</Text>
    </Card>
  );
}
