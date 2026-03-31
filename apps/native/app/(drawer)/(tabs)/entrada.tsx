import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { Authenticated, AuthLoading, Unauthenticated, useQuery, useMutation } from "convex/react";
import { Link } from "expo-router";
import { Button, Chip, Divider, Spinner, Surface, useThemeColor } from "heroui-native";
import { Lock, CheckCircle, Check, Undo2, Trash2 } from "lucide-react-native";
import { Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";

import { Container } from "@/components/container";

export default function EntradaTab() {
  return (
    <Container className="p-4">
      <View className="py-4 mb-2">
        <Text className="text-2xl font-semibold text-foreground tracking-tight">
          Recibos (Entrada)
        </Text>
        <Text className="text-muted text-sm mt-1">
          Recibos aguardando aceitação no armazém
        </Text>
      </View>

      <Authenticated>
        <EntradaContent />
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
  PendingReceipt: "Pendente",
  Accepted: "Aceito",
  Returned: "Devolvido",
  Discarded: "Descartado",
};

function EntradaContent() {
  const receipts = useQuery(api.receipts.list);
  const acceptReceipt = useMutation(api.receipts.acceptReceipt);
  const returnReceipt = useMutation(api.receipts.returnReceipt);
  const discardReceipt = useMutation(api.receipts.discardReceipt);

  const successColor = useThemeColor("success");
  const dangerColor = useThemeColor("danger");

  const handleAccept = (receiptId: Id<"receipts">) => {
    Alert.alert("Aceitar Recibo", "Confirmar entrada dos itens no armazém?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Aceitar",
        onPress: async () => {
          try {
            await acceptReceipt({ receiptId });
            Alert.alert("Sucesso", "Recibo aceito - entrada registrada");
          } catch (error: any) {
            Alert.alert("Erro", error.message || "Erro ao aceitar recibo");
          }
        },
      },
    ]);
  };

  const handleReturn = (receiptId: Id<"receipts">) => {
    Alert.alert("Devolver Recibo", "Deseja devolver este recibo?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Devolver",
        onPress: async () => {
          try {
            await returnReceipt({ receiptId });
            Alert.alert("Sucesso", "Recibo devolvido");
          } catch (error: any) {
            Alert.alert("Erro", error.message || "Erro ao devolver recibo");
          }
        },
      },
    ]);
  };

  const handleDiscard = (receiptId: Id<"receipts">) => {
    Alert.alert("Descartar Recibo", "Deseja descartar este recibo?", [
      { text: "Não", style: "cancel" },
      {
        text: "Descartar",
        style: "destructive",
        onPress: async () => {
          try {
            await discardReceipt({ receiptId });
            Alert.alert("Sucesso", "Recibo descartado");
          } catch (error: any) {
            Alert.alert("Erro", error.message || "Erro ao descartar recibo");
          }
        },
      },
    ]);
  };

  const formatDate = (timestamp: number) =>
    new Date(timestamp).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  if (!receipts) {
    return (
      <View className="flex-1 items-center justify-center py-8">
        <Spinner size="lg" />
      </View>
    );
  }

  const pendingReceipts = receipts.filter(
    (r: any) => r.status === "PendingReceipt"
  );

  if (pendingReceipts.length === 0) {
    return (
      <Surface variant="secondary" className="p-8 rounded-lg items-center">
        <CheckCircle size={48} color={successColor} />
        <Text className="text-foreground font-medium mt-4">
          Nenhum recibo pendente
        </Text>
        <Text className="text-muted text-sm text-center mt-2">
          Todos os recibos foram processados
        </Text>
      </Surface>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {pendingReceipts.map((receipt: any) => (
        <Surface
          key={receipt._id}
          variant="secondary"
          className="mb-3 rounded-lg overflow-hidden"
        >
          <View className="p-4">
            <View className="flex-row items-start justify-between mb-2">
              <View className="flex-1">
                <View className="flex-row items-center gap-2 mb-1">
                  <Chip variant="secondary" color="warning" size="sm">
                    <Chip.Label>
                      {STATUS_LABELS[receipt.status] ?? receipt.status}
                    </Chip.Label>
                  </Chip>
                </View>
                <Text className="text-foreground font-semibold text-base">
                  {receipt.supplier?.name ?? "Sem fornecedor"}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-foreground font-bold text-lg">
                  {receipt.lines.length}
                </Text>
                <Text className="text-muted text-xs">linha(s)</Text>
              </View>
            </View>

            <Divider className="my-2" />

            {receipt.lines.map((line: any) => (
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
                {receipt.notes ?? ""}
              </Text>
              <Text className="text-muted text-xs">
                {formatDate(receipt.createdAt)}
              </Text>
            </View>
          </View>

          <View className="flex-row border-t border-default/20">
            <TouchableOpacity
              className="flex-1 flex-row items-center justify-center py-3 border-r border-default/20"
              onPress={() => handleAccept(receipt._id)}
            >
              <Check size={18} color={successColor} />
              <Text
                className="ml-2 font-medium"
                style={{ color: successColor }}
              >
                Aceitar
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 flex-row items-center justify-center py-3 border-r border-default/20"
              onPress={() => handleReturn(receipt._id)}
            >
              <Undo2 size={18} color="#888" />
              <Text className="ml-2 font-medium text-muted">Devolver</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 flex-row items-center justify-center py-3"
              onPress={() => handleDiscard(receipt._id)}
            >
              <Trash2 size={18} color={dangerColor} />
              <Text
                className="ml-2 font-medium"
                style={{ color: dangerColor }}
              >
                Descartar
              </Text>
            </TouchableOpacity>
          </View>
        </Surface>
      ))}
      <View className="h-8" />
    </ScrollView>
  );
}
