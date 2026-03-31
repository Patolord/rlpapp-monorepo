import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { Authenticated, AuthLoading, Unauthenticated, useQuery, useMutation } from "convex/react";
import { Link } from "expo-router";
import { Button, Chip, Divider, Spinner, Surface, useThemeColor } from "heroui-native";
import { Lock, CheckCircle, Check, PackageCheck, XCircle } from "lucide-react-native";
import { Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";

import { Container } from "@/components/container";

export default function SaidaTab() {
  return (
    <Container className="p-4">
      <View className="py-4 mb-2">
        <Text className="text-2xl font-semibold text-foreground tracking-tight">
          Remessas (Saída)
        </Text>
        <Text className="text-muted text-sm mt-1">
          Remessas em trânsito aguardando ação
        </Text>
      </View>

      <Authenticated>
        <SaidaContent />
      </Authenticated>
      <Unauthenticated>
        <Surface variant="secondary" className="p-6 rounded-lg items-center">
          <Lock size={48} color="#888" />
          <Text className="text-foreground font-medium mt-4">Acesso Restrito</Text>
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

const STATUS_LABELS: Record<string, string> = {
  RegisteredOut: "Saída Registrada",
  PendingShipment: "Aguardando Envio",
  DeliveredConfirmed: "Entregue",
  CanceledBeforeLeave: "Cancelado",
  ReversalApplied: "Reversão Aplicada",
};

function SaidaContent() {
  const shipments = useQuery(api.shipments.list);
  const stageShipment = useMutation(api.shipments.stageShipment);
  const confirmDelivery = useMutation(api.shipments.confirmDelivery);
  const cancelBeforeLeave = useMutation(api.shipments.cancelBeforeLeave);

  const successColor = useThemeColor("success");
  const dangerColor = useThemeColor("danger");

  const handleStage = (shipmentId: Id<"shipments">) => {
    Alert.alert("Preparar Remessa", "Marcar remessa como pronta para envio?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Preparar",
        onPress: async () => {
          try {
            await stageShipment({ shipmentId });
            Alert.alert("Sucesso", "Remessa preparada para envio");
          } catch (error: any) {
            Alert.alert("Erro", error.message || "Erro ao preparar remessa");
          }
        },
      },
    ]);
  };

  const handleConfirmDelivery = (shipmentId: Id<"shipments">) => {
    Alert.alert("Confirmar Entrega", "Confirmar que os itens foram entregues?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Confirmar",
        onPress: async () => {
          try {
            await confirmDelivery({ shipmentId });
            Alert.alert("Sucesso", "Entrega confirmada");
          } catch (error: any) {
            Alert.alert("Erro", error.message || "Erro ao confirmar entrega");
          }
        },
      },
    ]);
  };

  const handleCancel = (shipmentId: Id<"shipments">) => {
    Alert.alert(
      "Cancelar Remessa",
      "Cancelar antes da saída? O estoque será restaurado.",
      [
        { text: "Não", style: "cancel" },
        {
          text: "Sim, cancelar",
          style: "destructive",
          onPress: async () => {
            try {
              await cancelBeforeLeave({ shipmentId });
              Alert.alert("Sucesso", "Remessa cancelada - estoque restaurado");
            } catch (error: any) {
              Alert.alert("Erro", error.message || "Erro ao cancelar");
            }
          },
        },
      ]
    );
  };

  const formatDate = (timestamp: number) =>
    new Date(timestamp).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  if (!shipments) {
    return (
      <View className="flex-1 items-center justify-center py-8">
        <Spinner size="lg" />
      </View>
    );
  }

  const activeShipments = shipments.filter(
    (s: any) =>
      s.status === "RegisteredOut" || s.status === "PendingShipment"
  );

  if (activeShipments.length === 0) {
    return (
      <Surface variant="secondary" className="p-8 rounded-lg items-center">
        <CheckCircle size={48} color={successColor} />
        <Text className="text-foreground font-medium mt-4">
          Nenhuma remessa ativa
        </Text>
        <Text className="text-muted text-sm text-center mt-2">
          Todas as remessas foram processadas
        </Text>
      </Surface>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {activeShipments.map((shipment: any) => (
        <Surface
          key={shipment._id}
          variant="secondary"
          className="mb-3 rounded-lg overflow-hidden"
        >
          <View className="p-4">
            <View className="flex-row items-start justify-between mb-2">
              <View className="flex-1">
                <View className="flex-row items-center gap-2 mb-1">
                  <Chip
                    variant="secondary"
                    color={
                      shipment.status === "RegisteredOut"
                        ? "warning"
                        : "primary"
                    }
                    size="sm"
                  >
                    <Chip.Label>
                      {STATUS_LABELS[shipment.status] ?? shipment.status}
                    </Chip.Label>
                  </Chip>
                </View>
                <Text className="text-foreground font-semibold text-base">
                  {shipment.site?.name ?? "Site desconhecido"}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-foreground font-bold text-lg">
                  {shipment.lines.length}
                </Text>
                <Text className="text-muted text-xs">linha(s)</Text>
              </View>
            </View>

            <Divider className="my-2" />

            {shipment.lines.map((line: any) => (
              <View
                key={line._id}
                className="flex-row items-center justify-between py-1"
              >
                <Text className="text-foreground text-sm flex-1">
                  {line.product?.name ?? "?"}
                </Text>
                <Text className="text-muted text-sm">
                  {line.qty} {line.product?.unit}
                </Text>
              </View>
            ))}

            <Divider className="my-2" />

            <View className="flex-row items-center justify-between">
              <Text className="text-muted text-xs">
                {shipment.notes ?? ""}
              </Text>
              <Text className="text-muted text-xs">
                {formatDate(shipment.createdAt)}
              </Text>
            </View>
          </View>

          <View className="flex-row border-t border-default/20">
            {shipment.status === "RegisteredOut" && (
              <TouchableOpacity
                className="flex-1 flex-row items-center justify-center py-3 border-r border-default/20"
                onPress={() => handleStage(shipment._id)}
              >
                <PackageCheck size={18} color="#888" />
                <Text className="ml-2 font-medium text-muted">Preparar</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              className="flex-1 flex-row items-center justify-center py-3 border-r border-default/20"
              onPress={() => handleConfirmDelivery(shipment._id)}
            >
              <Check size={18} color={successColor} />
              <Text
                className="ml-2 font-medium"
                style={{ color: successColor }}
              >
                Entregue
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 flex-row items-center justify-center py-3"
              onPress={() => handleCancel(shipment._id)}
            >
              <XCircle size={18} color={dangerColor} />
              <Text
                className="ml-2 font-medium"
                style={{ color: dangerColor }}
              >
                Cancelar
              </Text>
            </TouchableOpacity>
          </View>
        </Surface>
      ))}
      <View className="h-8" />
    </ScrollView>
  );
}
