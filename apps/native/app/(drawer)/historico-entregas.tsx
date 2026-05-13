import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useQuery,
} from "convex/react";
import { Link } from "expo-router";
import {
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Lock,
} from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { Container } from "@/components/container";
import { Button, ButtonText } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export default function HistoricoEntregasScreen() {
  return (
    <Container className="px-5 pt-4 pb-24">
      <View className="py-4 mb-4">
        <Text className="text-2xl font-semibold text-foreground tracking-tight">
          Histórico de Entregas
        </Text>
        <Text className="text-muted-foreground text-sm mt-1">
          Registro de confirmações de entrega via QR Code
        </Text>
      </View>

      <Authenticated>
        <HistoricoContent />
      </Authenticated>
      <Unauthenticated>
        <Card className="p-6 items-center">
          <Lock size={48} color="#888" />
          <Text className="text-foreground font-medium mt-4">Acesso Restrito</Text>
          <Text className="text-muted-foreground text-sm text-center mt-2">
            Faça login para acessar o histórico de entregas
          </Text>
          <Link href="/(auth)/sign-in" asChild>
            <Button className="mt-4">
              <ButtonText>Entrar</ButtonText>
            </Button>
          </Link>
        </Card>
      </Unauthenticated>
      <AuthLoading>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      </AuthLoading>
    </Container>
  );
}

function HistoricoContent() {
  const sites = useQuery(api.sites.list, { onlyActive: false });
  const [siteFilter, setSiteFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filterArgs: {
    siteId?: Id<"sites">;
    startDate?: number;
    endDate?: number;
  } = {};
  if (siteFilter) filterArgs.siteId = siteFilter as Id<"sites">;
  if (startDate) filterArgs.startDate = new Date(startDate).getTime();
  if (endDate)
    filterArgs.endDate = new Date(endDate).getTime() + 24 * 60 * 60 * 1000;

  const confirmations = useQuery(api.deliveryConfirmations.list, filterArgs);

  const siteOptions = [
    { label: "Todos os sites", value: "" },
    ...(sites ?? []).map((s) => ({ label: s.name, value: s._id })),
  ];

  const formatDateTime = (timestamp: number) =>
    new Date(timestamp).toLocaleString("pt-BR");

  const clearFilters = () => {
    setSiteFilter("");
    setStartDate("");
    setEndDate("");
  };

  const hasFilters = siteFilter || startDate || endDate;

  if (!confirmations) {
    return (
      <View className="flex-1 items-center justify-center py-8">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View className="gap-4">
        <Card className="rounded-2xl p-4">
          <CardHeader>
            <CardTitle className="text-base">Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <View className="gap-3">
              <View className="gap-1">
                <Label className="text-xs">Site</Label>
                <Select
                  value={siteFilter}
                  onValueChange={setSiteFilter}
                  options={siteOptions}
                  placeholder="Todos os sites"
                />
              </View>
              <View className="flex-row gap-3">
                <View className="flex-1 gap-1">
                  <Label className="text-xs">Data inicial (AAAA-MM-DD)</Label>
                  <Input
                    value={startDate}
                    onChangeText={setStartDate}
                    placeholder="2025-01-01"
                  />
                </View>
                <View className="flex-1 gap-1">
                  <Label className="text-xs">Data final (AAAA-MM-DD)</Label>
                  <Input
                    value={endDate}
                    onChangeText={setEndDate}
                    placeholder="2025-12-31"
                  />
                </View>
              </View>
              {hasFilters && (
                <Button variant="ghost" size="sm" onPress={clearFilters}>
                  <ButtonText variant="ghost">Limpar filtros</ButtonText>
                </Button>
              )}
            </View>
          </CardContent>
        </Card>

        <Card className="rounded-2xl p-4">
          <CardHeader>
            <View className="flex-row items-center gap-2">
              <ClipboardCheck size={20} color="#3478f6" />
              <CardTitle>Confirmações de Entrega</CardTitle>
            </View>
            <CardDescription>
              {`${confirmations.length} registro(s) encontrado(s)`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {confirmations.length === 0 ? (
              <Text className="text-muted-foreground text-sm">
                Nenhuma confirmação encontrada
              </Text>
            ) : (
              <View className="gap-3">
                {confirmations.map((c: any) => (
                  <View key={c._id}>
                    <Pressable
                      onPress={() =>
                        setExpandedId(expandedId === c._id ? null : c._id)
                      }
                    >
                      <Card className="rounded-xl p-3 bg-secondary">
                        <View className="flex-row items-center gap-2 mb-2">
                          {expandedId === c._id ? (
                            <ChevronDown size={16} className="text-muted-foreground" />
                          ) : (
                            <ChevronRight size={16} className="text-muted-foreground" />
                          )}
                          <Text className="text-foreground font-medium flex-1">
                            {c.site?.name ?? "—"}
                          </Text>
                        </View>
                        <View className="ml-6 gap-1">
                          <Text className="text-sm text-foreground">
                            Recebido por:{" "}
                            <Text className="font-medium">{c.receiverName}</Text>
                          </Text>
                          <Text className="text-xs text-muted-foreground">
                            Confirmado por: {c.confirmedByUserName}
                          </Text>
                          <Text className="text-xs text-muted-foreground">
                            {formatDateTime(c.confirmedAt)}
                          </Text>
                          {c.notes ? (
                            <Text
                              className="text-xs text-muted-foreground mt-1"
                              numberOfLines={2}
                            >
                              Obs: {c.notes}
                            </Text>
                          ) : null}
                        </View>
                      </Card>
                    </Pressable>

                    {expandedId === c._id && (
                      <Card className="rounded-b-xl p-3 -mt-1 bg-secondary/50">
                        <Text className="text-xs text-muted-foreground mb-2">
                          Itens da remessa
                        </Text>
                        <View className="gap-2">
                          {c.shipmentLines.map((line: any, idx: number) => (
                            <View
                              key={idx}
                              className="flex-row items-center justify-between py-2 border-b border-border"
                            >
                              <Text className="text-sm text-foreground font-medium flex-1">
                                {line.productName}
                              </Text>
                              <Text className="text-sm text-muted-foreground">
                                {line.qty} {line.unit}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </Card>
                    )}
                  </View>
                ))}
              </View>
            )}
          </CardContent>
        </Card>
      </View>

      <View className="h-24" />
    </ScrollView>
  );
}
