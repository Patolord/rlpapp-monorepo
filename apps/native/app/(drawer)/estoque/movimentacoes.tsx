import { api } from "@rlpapp/backend/convex/_generated/api";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { History, Filter, Lock } from "lucide-react-native";
import { useState } from "react";
import { FlatList, Text, View } from "react-native";
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
import { Select } from "@/components/ui/select";
import { MovementCard } from "@/components/estoque/movement-card";

type EventType = "RegisteredIn" | "RegisteredOut" | "Reversal" | "InventoryAdjust";

const filterOptions = [
  { label: "Todos", value: "all" },
  { label: "Entrada", value: "RegisteredIn" },
  { label: "Saída", value: "RegisteredOut" },
  { label: "Reversão", value: "Reversal" },
  { label: "Ajuste", value: "InventoryAdjust" },
];

export default function MovimentacoesScreen() {
  return (
    <View className="flex-1 px-5 pt-4 pb-4">
      <Authenticated>
        <MovimentacoesContent />
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

function MovimentacoesContent() {
  const [typeFilter, setTypeFilter] = useState<EventType | "all">("all");

  const events = useQuery(api.inventory.listEvents, {
    type: typeFilter !== "all" ? typeFilter : undefined,
    limit: 200,
  });

  return (
    <View className="gap-4 flex-1">
      <View>
        <Text className="text-2xl font-bold text-foreground">
          Histórico de Eventos
        </Text>
        <Text className="text-muted-foreground text-sm">
          Ledger append-only de todos os eventos de inventário
        </Text>
      </View>

      <Card>
        <CardHeader>
          <View className="flex-row items-center gap-2">
            <Filter size={16} color="#666" />
            <CardTitle className="text-base">Filtros</CardTitle>
          </View>
        </CardHeader>
        <CardContent>
          <View className="flex-row gap-3 items-end">
            <View className="flex-1 gap-1">
              <Text className="text-xs text-muted-foreground">Tipo de Evento</Text>
              <Select
                value={typeFilter}
                onValueChange={(value) =>
                  setTypeFilter(value as EventType | "all")
                }
                options={filterOptions}
              />
            </View>
            {typeFilter !== "all" && (
              <Button
                variant="ghost"
                size="sm"
                onPress={() => setTypeFilter("all")}
              >
                <ButtonText variant="ghost">Limpar</ButtonText>
              </Button>
            )}
          </View>
        </CardContent>
      </Card>

      <Card className="flex-1">
        <CardHeader>
          <View className="flex-row items-center gap-2">
            <History size={20} color="#3478f6" />
            <CardTitle>Eventos de Inventário</CardTitle>
          </View>
          <CardDescription>
            {events?.length ?? 0} eventos encontrados
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1">
          {!events ? (
            <LoadingState size="small" />
          ) : events.length === 0 ? (
            <EmptyState variant="plain" title="Nenhum evento encontrado" />
          ) : (
            <FlatList
              data={events}
              keyExtractor={(item) => item._id}
              renderItem={({ item }) => (
                <MovementCard
                  type={item.type}
                  productName={item.product?.name ?? "Produto não encontrado"}
                  qtyDelta={item.qtyDelta}
                  unit={item.product?.unit}
                  createdAt={item.createdAt}
                  refType={item.refType}
                  refId={item.refId}
                />
              )}
              ItemSeparatorComponent={() => <View className="h-2" />}
              scrollEnabled={false}
            />
          )}
        </CardContent>
      </Card>
    </View>
  );
}
