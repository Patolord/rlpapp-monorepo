import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useConvex, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import {
  AlertTriangle,
  ChevronRight,
  CloudUpload,
  HardHat,
  QrCode,
  Wrench,
} from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";

import { Button, ButtonText } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/engenharia/status-badge";
import type { EquipmentStatus } from "@/lib/equipment-status";
import { listPendingRecords, subscribeQueue } from "@/lib/offline-queue";

export default function EngenhariaDashboardScreen() {
  const router = useRouter();
  const convex = useConvex();
  const equipmentList = useQuery(api.equipment.list);
  const [openingId, setOpeningId] = useState<Id<"equipment"> | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPending = useCallback(() => {
    void listPendingRecords().then((records) => setPendingCount(records.length));
  }, []);

  useEffect(() => {
    refreshPending();
    const unsubscribe = subscribeQueue(refreshPending);
    return () => unsubscribe();
  }, [refreshPending]);

  const total = equipmentList?.length ?? 0;
  const operational =
    equipmentList?.filter((e) => e.status === "operational").length ?? 0;
  const warnings =
    equipmentList?.filter((e) => e.status === "warning").length ?? 0;
  const errors = equipmentList?.filter((e) => e.status === "error").length ?? 0;

  async function openEquipment(equipmentId: Id<"equipment">) {
    setOpeningId(equipmentId);
    try {
      const qrCode = await convex.query(api.qrCodes.getByEquipmentId, {
        equipmentId,
      });
      if (qrCode) {
        router.push({
          pathname: "/equipamento/[token]",
          params: { token: qrCode.token },
        });
      } else {
        Alert.alert(
          "Sem QR vinculado",
          "Não há um código QR vinculado a este equipamento."
        );
      }
    } catch (err) {
      console.error("Failed to resolve equipment token:", err);
      Alert.alert("Erro", "Não foi possível abrir o equipamento.");
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 24 }}
      showsVerticalScrollIndicator={false}
    >
      <View>
        <Text className="text-2xl font-bold text-foreground">Painel</Text>
        <Text className="mt-1 text-muted-foreground">
          Escaneie um equipamento ou acesse a lista.
        </Text>
      </View>

      <Button className="h-16 w-full" onPress={() => router.push("/scanner")}>
        <QrCode size={24} color="#fafafa" />
        <ButtonText className="ml-2 text-base">Escanear QR Code</ButtonText>
      </Button>

      {pendingCount > 0 && (
        <Pressable onPress={() => router.push("/pendentes")}>
          <Card className="flex-row items-center gap-3 border border-amber-300 bg-amber-50 p-4">
            <CloudUpload size={20} color="#92400e" />
            <Text className="flex-1 text-sm text-amber-800">
              {pendingCount} registro{pendingCount > 1 ? "s" : ""} aguardando
              envio
            </Text>
            <ChevronRight size={18} color="#92400e" />
          </Card>
        </Pressable>
      )}

      <View className="flex-row flex-wrap gap-3">
        <StatTile label="Equipamentos" value={total} tone="default" />
        <StatTile label="Operacionais" value={operational} tone="success" />
        <StatTile label="Alertas" value={warnings} tone="warning" />
        <StatTile label="Erros" value={errors} tone="error" />
      </View>

      <View className="gap-3">
        <Text className="text-lg font-semibold text-foreground">
          Equipamentos
        </Text>

        {equipmentList === undefined ? (
          <View className="items-center justify-center py-12">
            <ActivityIndicator size="large" />
          </View>
        ) : equipmentList.length === 0 ? (
          <Card className="items-center gap-3 py-10">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-amber-500/10">
              <HardHat size={28} color="#f59e0b" />
            </View>
            <Text className="text-center text-base font-medium text-foreground">
              Nenhum equipamento cadastrado
            </Text>
            <Text className="px-6 text-center text-sm text-muted-foreground">
              Escaneie um QR code para cadastrar o primeiro equipamento.
            </Text>
          </Card>
        ) : (
          <View className="gap-2">
            {equipmentList.map((equipment) => (
              <Pressable
                key={equipment._id}
                onPress={() => openEquipment(equipment._id)}
                disabled={openingId !== null}
              >
                <Card className="flex-row items-center gap-3 p-4">
                  <View className="h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                    <Wrench size={20} color="#f59e0b" />
                  </View>
                  <View className="flex-1">
                    <Text
                      className="text-base font-semibold text-foreground"
                      numberOfLines={1}
                    >
                      {equipment.description ?? "Equipamento"}
                    </Text>
                    <View className="mt-1 flex-row">
                      <StatusBadge status={equipment.status as EquipmentStatus} />
                    </View>
                  </View>
                  {openingId === equipment._id ? (
                    <ActivityIndicator />
                  ) : (
                    <ChevronRight size={20} color="#9ca3af" />
                  )}
                </Card>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "default" | "success" | "warning" | "error";
}) {
  const toneColor =
    tone === "success"
      ? "#16a34a"
      : tone === "warning"
        ? "#d97706"
        : tone === "error"
          ? "#ef4444"
          : "#1a1a2e";

  return (
    <Card className="min-w-[45%] flex-1 p-4">
      <View className="flex-row items-center gap-2">
        {tone === "error" || tone === "warning" ? (
          <AlertTriangle size={16} color={toneColor} />
        ) : null}
        <Text className="text-2xl font-bold" style={{ color: toneColor }}>
          {value}
        </Text>
      </View>
      <Text className="mt-0.5 text-xs text-muted-foreground">{label}</Text>
    </Card>
  );
}
