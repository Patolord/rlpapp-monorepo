import { api } from "@rlpapp/backend/convex/_generated/api";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { History, Filter, Lock } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { Link } from "expo-router";

import { Container } from "@/components/container";
import { Button, ButtonText } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";

export default function MovimentacoesScreen() {
  return (
    <Container className="px-5 pt-4 pb-4">
      <Authenticated>
        <MovimentacoesContent />
      </Authenticated>
      <Unauthenticated>
        <Card className="p-6 items-center">
          <Lock size={48} color="#888" />
          <Text className="text-foreground font-medium mt-4">Acesso Restrito</Text>
          <Text className="text-muted-foreground text-sm text-center mt-2">Faça login para acessar</Text>
          <Link href="/(auth)/sign-in" asChild>
            <Button className="mt-4"><ButtonText>Entrar</ButtonText></Button>
          </Link>
        </Card>
      </Unauthenticated>
      <AuthLoading>
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" /></View>
      </AuthLoading>
    </Container>
  );
}

const typeLabels: Record<string, string> = {
  RegisteredIn: "Entrada",
  RegisteredOut: "Saída",
  Reversal: "Reversão",
  InventoryAdjust: "Ajuste",
};

const typeVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  RegisteredIn: "default",
  RegisteredOut: "secondary",
  Reversal: "outline",
  InventoryAdjust: "destructive",
};

const refTypeLabels: Record<string, string> = {
  receipt: "Recibo",
  shipment: "Remessa",
  adjustment: "Ajuste",
};

const filterOptions = [
  { label: "Todos", value: "all" },
  { label: "Entrada", value: "RegisteredIn" },
  { label: "Saída", value: "RegisteredOut" },
  { label: "Reversão", value: "Reversal" },
  { label: "Ajuste", value: "InventoryAdjust" },
];

function MovimentacoesContent() {
  const [typeFilter, setTypeFilter] = useState("all");

  const events = useQuery(api.inventory.listEvents, {
    type: typeFilter !== "all" ? typeFilter : undefined,
    limit: 200,
  });

  const formatDate = (timestamp: number) => new Date(timestamp).toLocaleString("pt-BR");

  return (
    <View className="gap-4 flex-1">
      <View>
        <Text className="text-2xl font-bold text-foreground">Histórico de Eventos</Text>
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
                onValueChange={setTypeFilter}
                options={filterOptions}
              />
            </View>
            {typeFilter !== "all" && (
              <Button variant="ghost" size="sm" onPress={() => setTypeFilter("all")}>
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
          <CardDescription>{events?.length ?? 0} eventos encontrados</CardDescription>
        </CardHeader>
        <CardContent>
          {!events ? (
            <ActivityIndicator />
          ) : events.length === 0 ? (
            <Text className="text-muted-foreground">Nenhum evento encontrado</Text>
          ) : (
            <View className="gap-2">
              {events.map((event: any) => (
                <View key={event._id} className="rounded-lg border border-border p-3">
                  <View className="flex-row items-center justify-between mb-1">
                    <Badge variant={typeVariants[event.type] ?? "outline"}>
                      {typeLabels[event.type] ?? event.type}
                    </Badge>
                    <Text className="text-muted-foreground text-xs">{formatDate(event.createdAt)}</Text>
                  </View>
                  <Text className="text-foreground font-medium text-sm">
                    {event.product?.name ?? "Produto não encontrado"}
                  </Text>
                  <View className="flex-row items-center justify-between mt-1">
                    <Text
                      className="font-medium text-sm"
                      style={{ color: event.qtyDelta > 0 ? "#16a34a" : "#dc2626" }}
                    >
                      {event.qtyDelta > 0 ? "+" : ""}
                      {event.qtyDelta} {event.product?.unit}
                    </Text>
                    <Text className="text-muted-foreground text-xs">
                      {refTypeLabels[event.refType] ?? event.refType} • {event.refId?.substring(0, 10)}...
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </CardContent>
      </Card>
    </View>
  );
}
