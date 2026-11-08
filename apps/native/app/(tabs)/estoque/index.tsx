import { api } from "@rlpapp/backend/convex/_generated/api";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import {
  Lock,
  Package,
  ArrowUpDown,
  ShieldCheck,
  Search,
} from "lucide-react-native";
import { useState, useMemo } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { Link } from "expo-router";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  LoadingState,
} from "@rlpapp/ui/native";
import { Button, ButtonText } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BalanceCard } from "@/components/estoque/balance-card";

export default function EstoqueCentralScreen() {
  return (
    <View className="flex-1 px-5 pt-4 pb-4">
      <Authenticated>
        <CentralContent />
      </Authenticated>
      <Unauthenticated>
        <Card className="p-6 items-center">
          <Lock size={48} color="#888" />
          <Text className="text-foreground font-medium mt-4">Acesso Restrito</Text>
          <Text className="text-muted-foreground text-sm text-center mt-2">
            Faça login para acessar
          </Text>
          <Link href="/(auth)/sign-in" asChild>
            <Button className="mt-4">
              <ButtonText>Entrar</ButtonText>
            </Button>
          </Link>
        </Card>
      </Unauthenticated>
      <AuthLoading>
        <LoadingState />
      </AuthLoading>
    </View>
  );
}

function CentralContent() {
  const [search, setSearch] = useState("");

  const access = useQuery(api.inventory.getAccess, {});
  const canViewCentral = access?.canViewCentral === true;
  const { results: balances, status, loadMore } = usePaginatedQuery(
    api.inventory.listBalances,
    canViewCentral ? {} : "skip",
    { initialNumItems: 100 }
  );
  const events = useQuery(
    api.inventory.listEvents,
    canViewCentral ? { limit: 50 } : "skip"
  );
  const pendingApprovals = useQuery(
    api.inventory.listPendingApprovals,
    access ? {} : "skip"
  );

  const filteredBalances = useMemo(() => {
    if (!search.trim()) return balances;
    const term = search.toLowerCase();
    return balances.filter(
      (b) =>
        b.materialName.toLowerCase().includes(term) ||
        b.locationName.toLowerCase().includes(term)
    );
  }, [balances, search]);

  if (!access) return <LoadingState />;

  if (!access.canViewCentral) {
    return (
      <EmptyState
        variant="plain"
        title="Acesso restrito"
        description="A Engenharia só pode consultar estoques de obras."
      />
    );
  }

  return (
    <View className="gap-4 flex-1">
      <View>
        <Text className="text-2xl font-bold text-foreground">Central de Estoque</Text>
        <Text className="text-muted-foreground text-sm">
          Visão geral do inventário
        </Text>
      </View>

      {/* Metric cards */}
      <View className="flex-row gap-3">
        <View className="flex-1 rounded-lg border border-border bg-card p-3">
          <View className="flex-row items-center gap-2 mb-1">
            <Package size={16} color="#3478f6" />
            <Text className="text-muted-foreground text-xs">Materiais</Text>
          </View>
          <Text className="text-foreground text-lg font-bold">
            {balances.length}
          </Text>
        </View>
        <View className="flex-1 rounded-lg border border-border bg-card p-3">
          <View className="flex-row items-center gap-2 mb-1">
            <ArrowUpDown size={16} color="#f59e0b" />
            <Text className="text-muted-foreground text-xs">Movimentações</Text>
          </View>
          <Text className="text-foreground text-lg font-bold">
            {events?.length ?? 0}
          </Text>
        </View>
        <View className="flex-1 rounded-lg border border-border bg-card p-3">
          <View className="flex-row items-center gap-2 mb-1">
            <ShieldCheck size={16} color="#10b981" />
            <Text className="text-muted-foreground text-xs">Pendentes</Text>
          </View>
          <Text className="text-foreground text-lg font-bold">
            {pendingApprovals?.length ?? 0}
          </Text>
        </View>
      </View>

      {/* Search */}
      <View className="flex-row items-center gap-2">
        <View className="flex-1 flex-row items-center rounded-md border border-input bg-card px-3">
          <Search size={16} color="#9ca3af" />
          <Input
            className="flex-1 border-0 bg-transparent"
            placeholder="Buscar material ou local..."
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {/* Balances list */}
      <Card className="flex-1">
        <CardHeader>
          <CardTitle>Saldos de Material</CardTitle>
          <CardDescription>
            {filteredBalances.length} materiais encontrados
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1">
          {status === "LoadingFirstPage" ? (
            <LoadingState size="small" />
          ) : filteredBalances.length === 0 ? (
            <EmptyState
              variant="plain"
              title={search ? "Nenhum resultado" : "Nenhum material cadastrado"}
            />
          ) : (
            <FlatList
              data={filteredBalances}
              keyExtractor={(item) => item._id}
              renderItem={({ item }) => (
                <BalanceCard
                  name={item.materialName}
                  quantity={item.quantity}
                  unit={item.unit ?? "un"}
                  location={item.locationName}
                />
              )}
              ItemSeparatorComponent={() => <View className="h-2" />}
              scrollEnabled={false}
              ListFooterComponent={
                status === "CanLoadMore" || status === "LoadingMore" ? (
                  <Pressable
                    onPress={() => loadMore(100)}
                    disabled={status === "LoadingMore"}
                    className="items-center py-3"
                  >
                    <Text className="text-sm font-medium text-primary">
                      {status === "LoadingMore"
                        ? "Carregando…"
                        : "Carregar mais"}
                    </Text>
                  </Pressable>
                ) : null
              }
            />
          )}
        </CardContent>
      </Card>
    </View>
  );
}
