import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import {
  AlertTriangle,
  Box,
  ClipboardList,
  Package,
  Receipt,
  Truck,
} from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { Card } from "@/components/ui/card";

export default function ComprasDashboardScreen() {
  const [now] = useState(() => Date.now());
  const stats = useQuery(api.priceEvents.dashboardStats, { now });

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 24 }}
      showsVerticalScrollIndicator={false}
    >
      <View>
        <Text className="text-2xl font-bold text-foreground">Painel</Text>
        <Text className="mt-1 text-muted-foreground">
          Visão geral do módulo de compras.
        </Text>
      </View>

      {stats === undefined ? (
        <View className="items-center justify-center py-16">
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <View className="flex-row flex-wrap gap-3">
          <StatCard
            label="Materiais ativos"
            value={stats.activeMaterials}
            icon={<Package size={20} color="#3b82f6" />}
            tone="default"
          />
          <StatCard
            label="Fornecedores ativos"
            value={stats.activeSuppliers}
            icon={<Truck size={20} color="#10b981" />}
            tone="default"
          />
          <StatCard
            label="Preços pendentes"
            value={stats.unreviewedPrices}
            icon={<ClipboardList size={20} color="#d97706" />}
            tone={stats.unreviewedPrices > 0 ? "warning" : "default"}
          />
          <StatCard
            label="Preços obsoletos"
            value={stats.stalePrices}
            icon={<AlertTriangle size={20} color="#ef4444" />}
            tone={stats.stalePrices > 0 ? "error" : "default"}
          />
          <StatCard
            label="Itens sem preço"
            value={stats.takeoffsNeedingPricing}
            icon={<Box size={20} color="#8b5cf6" />}
            tone={stats.takeoffsNeedingPricing > 0 ? "warning" : "default"}
          />
          <StatCard
            label="Eventos recentes"
            value={stats.recentEvents}
            icon={<Receipt size={20} color="#6366f1" />}
            tone="default"
          />
        </View>
      )}
    </ScrollView>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
  onPress,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "default" | "warning" | "error";
  onPress?: () => void;
}) {
  const valueColor =
    tone === "error"
      ? "#ef4444"
      : tone === "warning"
        ? "#d97706"
        : undefined;

  const content = (
    <Card className="min-w-[45%] flex-1 gap-2 p-4">
      <View className="flex-row items-center gap-2">
        {icon}
        <Text
          className="text-2xl font-bold text-foreground"
          style={valueColor ? { color: valueColor } : undefined}
        >
          {value}
        </Text>
      </View>
      <Text className="text-xs text-muted-foreground">{label}</Text>
    </Card>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{content}</Pressable>;
  }
  return content;
}
