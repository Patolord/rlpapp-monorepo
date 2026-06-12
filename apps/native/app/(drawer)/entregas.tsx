import { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useQuery,
} from "convex/react";
import {
  ChevronDown,
  ChevronRight,
  Lock,
  MapPin,
  PackageCheck,
  User,
} from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Link } from "expo-router";
import { formatDateTime } from "@rlpapp/shared";

import { Container } from "@/components/container";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonText } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Select } from "@/components/ui/select";

type DeliveryConfirmation = FunctionReturnType<
  typeof api.deliveryConfirmations.list
>[number];

export default function EntregasScreen() {
  return (
    <Container className="px-5 pt-4 pb-24">
      <Authenticated>
        <EntregasContent />
      </Authenticated>
      <Unauthenticated>
        <Card className="p-6 items-center">
          <Lock size={48} color="#888" />
          <Text className="text-foreground font-medium mt-4">
            Acesso Restrito
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

function EntregasContent() {
  const sites = useQuery(api.sites.list, {});
  const [siteFilter, setSiteFilter] = useState("");
  const confirmations = useQuery(api.deliveryConfirmations.list, {
    siteId: siteFilter
      ? (siteFilter as DeliveryConfirmation["receivedAtSiteId"])
      : undefined,
  });

  const siteOptions = [
    { label: "Todos os sites", value: "" },
    ...(sites ?? []).map((s) => ({ label: s.name, value: s._id as string })),
  ];

  return (
    <View className="gap-4">
      <View>
        <Text className="text-2xl font-bold text-foreground">
          Histórico de Entregas
        </Text>
        <Text className="text-muted-foreground text-sm">
          Confirmações de recebimento nas obras
        </Text>
      </View>

      <Select
        value={siteFilter}
        onValueChange={setSiteFilter}
        options={siteOptions}
        placeholder="Filtrar por site"
      />

      {!confirmations ? (
        <ActivityIndicator />
      ) : confirmations.length === 0 ? (
        <Card className="p-6 items-center">
          <PackageCheck size={32} color="#94a3b8" />
          <Text className="text-muted-foreground mt-2">
            Nenhuma entrega confirmada
          </Text>
        </Card>
      ) : (
        <View className="gap-3">
          {confirmations.map((confirmation) => (
            <ConfirmationCard
              key={confirmation._id}
              confirmation={confirmation}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function ConfirmationCard({
  confirmation,
}: {
  confirmation: DeliveryConfirmation;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <Pressable onPress={() => setExpanded((e) => !e)}>
        <CardHeader>
          <View className="flex-row items-center gap-2">
            {expanded ? (
              <ChevronDown size={16} color="#666" />
            ) : (
              <ChevronRight size={16} color="#666" />
            )}
            <View className="flex-1">
              <View className="flex-row items-center gap-1.5">
                <MapPin size={14} color="#6d5efc" />
                <CardTitle>
                  {confirmation.site?.name ?? "Site removido"}
                </CardTitle>
              </View>
              <CardDescription>
                {formatDateTime(confirmation.confirmedAt)}
              </CardDescription>
            </View>
            <Badge variant="default">Entregue</Badge>
          </View>
        </CardHeader>
      </Pressable>

      {expanded && (
        <CardContent className="gap-3">
          <View className="flex-row items-center gap-1.5">
            <User size={14} color="#666" />
            <Text className="text-sm text-foreground">
              Recebido por <Text className="font-medium">{confirmation.receiverName}</Text>
            </Text>
          </View>
          <Text className="text-xs text-muted-foreground">
            Confirmado no sistema por {confirmation.confirmedByUserName}
          </Text>

          {confirmation.shipmentLines.length > 0 && (
            <View className="gap-1 border border-border rounded-lg p-3">
              {confirmation.shipmentLines.map((line, i) => (
                <View key={i} className="flex-row justify-between">
                  <Text className="text-sm text-foreground flex-1">
                    {line.productName}
                  </Text>
                  <Text className="text-sm text-muted-foreground">
                    {line.countedQty ?? line.qty} {line.unit}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {confirmation.notes && (
            <Text className="text-sm text-foreground">
              <Text className="font-medium">Observações: </Text>
              {confirmation.notes}
            </Text>
          )}
        </CardContent>
      )}
    </Card>
  );
}
