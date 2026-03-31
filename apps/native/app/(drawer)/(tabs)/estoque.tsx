import { api } from "@rlpapp/backend/convex/_generated/api";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { Link } from "expo-router";
import { Button, Chip, Divider, Spinner, Surface, useThemeColor } from "heroui-native";
import {
  Lock,
  Package,
  MapPin,
  Warehouse,
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  AlertCircle,
} from "lucide-react-native";
import { ScrollView, Text, View } from "react-native";

import { Container } from "@/components/container";

export default function EstoqueTab() {
  return (
    <Container className="p-4">
      <View className="py-4 mb-2">
        <Text className="text-2xl font-semibold text-foreground tracking-tight">
          Dashboard de Estoque
        </Text>
        <Text className="text-muted text-sm mt-1">Visão geral do inventário</Text>
      </View>

      <Authenticated>
        <EstoqueDashboard />
      </Authenticated>
      <Unauthenticated>
        <Surface variant="secondary" className="p-6 rounded-lg items-center">
          <Lock size={48} color="#888" />
          <Text className="text-foreground font-medium mt-4">Acesso Restrito</Text>
          <Text className="text-muted text-sm text-center mt-2">
            Faça login para acessar o sistema de estoque
          </Text>
          <Link href="/(auth)/sign-in" asChild>
            <Button variant="primary" className="mt-4">
              <Button.Label>Entrar</Button.Label>
            </Button>
          </Link>
        </Surface>
      </Unauthenticated>
      <AuthLoading>
        <View className="flex-1 items-center justify-center">
          <Spinner size="lg" />
        </View>
      </AuthLoading>
    </Container>
  );
}

function EstoqueDashboard() {
  const summary = useQuery(api.inventory.getDashboardSummary);
  const lowStock = useQuery(api.products.getLowStock);

  const dangerColor = useThemeColor("danger");
  const successColor = useThemeColor("success");

  if (!summary) {
    return (
      <View className="flex-1 items-center justify-center py-8">
        <Spinner size="lg" />
      </View>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View className="flex-row flex-wrap gap-3 mb-4">
        <Surface variant="secondary" className="flex-1 min-w-[45%] p-4 rounded-lg">
          <View className="flex-row items-center justify-between">
            <Text className="text-muted text-xs">Produtos</Text>
            <Package size={18} color="#888" />
          </View>
          <Text className="text-foreground text-2xl font-bold mt-1">
            {summary.totalProducts}
          </Text>
        </Surface>

        <Surface variant="secondary" className="flex-1 min-w-[45%] p-4 rounded-lg">
          <View className="flex-row items-center justify-between">
            <Text className="text-muted text-xs">Sites</Text>
            <MapPin size={18} color="#888" />
          </View>
          <Text className="text-foreground text-2xl font-bold mt-1">
            {summary.totalSites}
          </Text>
        </Surface>

        <Surface variant="secondary" className="flex-1 min-w-[45%] p-4 rounded-lg">
          <View className="flex-row items-center justify-between">
            <Text className="text-muted text-xs">No Armazém</Text>
            <Warehouse size={18} color="#888" />
          </View>
          <Text className="text-foreground text-2xl font-bold mt-1">
            {summary.totalWarehouseItems}
          </Text>
        </Surface>

        <Surface variant="secondary" className="flex-1 min-w-[45%] p-4 rounded-lg">
          <View className="flex-row items-center justify-between">
            <Text className="text-muted text-xs">Estoque Baixo</Text>
            <AlertTriangle size={18} color={dangerColor} />
          </View>
          <Text className="text-2xl font-bold mt-1" style={{ color: dangerColor }}>
            {summary.lowStockCount}
          </Text>
        </Surface>
      </View>

      <View className="flex-row gap-3 mb-4">
        <Surface variant="secondary" className="flex-1 p-4 rounded-lg">
          <View className="flex-row items-center gap-2 mb-2">
            <ArrowDownCircle size={20} color={successColor} />
            <Text className="text-foreground font-medium">Recibos Pend.</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Text className="text-foreground text-3xl font-bold">
              {summary.pendingReceipts}
            </Text>
            <Chip
              variant="secondary"
              color={summary.pendingReceipts > 0 ? "warning" : "default"}
              size="sm"
            >
              <Chip.Label>
                {summary.pendingReceipts > 0 ? "Pendente" : "Nenhum"}
              </Chip.Label>
            </Chip>
          </View>
        </Surface>

        <Surface variant="secondary" className="flex-1 p-4 rounded-lg">
          <View className="flex-row items-center gap-2 mb-2">
            <ArrowUpCircle size={20} color={dangerColor} />
            <Text className="text-foreground font-medium">Remessas Ativas</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Text className="text-foreground text-3xl font-bold">
              {summary.activeShipments}
            </Text>
            <Chip
              variant="secondary"
              color={summary.activeShipments > 0 ? "warning" : "default"}
              size="sm"
            >
              <Chip.Label>
                {summary.activeShipments > 0 ? "Em andamento" : "Nenhuma"}
              </Chip.Label>
            </Chip>
          </View>
        </Surface>
      </View>

      {lowStock && lowStock.length > 0 && (
        <Surface variant="secondary" className="p-4 rounded-lg border border-danger/30">
          <View className="flex-row items-center gap-2 mb-3">
            <AlertCircle size={20} color={dangerColor} />
            <Text className="text-foreground font-medium">Alerta de Estoque Baixo</Text>
          </View>
          <Divider className="mb-3" />
          {lowStock.slice(0, 5).map((product: any) => (
            <View key={product._id} className="flex-row items-center justify-between py-2">
              <View className="flex-1">
                <Text className="text-foreground text-sm font-medium">{product.name}</Text>
                <Text className="text-muted text-xs">
                  Mínimo: {product.minQuantity} {product.unit}
                </Text>
              </View>
              <View className="items-end">
                <Text className="font-bold" style={{ color: dangerColor }}>
                  {product.currentStock} {product.unit}
                </Text>
                <Text className="text-muted text-xs">
                  Faltam: {product.deficit}
                </Text>
              </View>
            </View>
          ))}
        </Surface>
      )}

      <View className="h-8" />
    </ScrollView>
  );
}
