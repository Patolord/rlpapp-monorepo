import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CloudUpload,
  Trash2,
  Wrench,
} from "lucide-react-native";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, ButtonText } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/engenharia/status-badge";
import { useAppTheme } from "@/contexts/app-theme-context";
import { COLORS } from "@/lib/colors";
import { getMaintenanceLogTypeLabel } from "@/lib/maintenance-log-type";
import {
  removePendingRecord,
  requestOfflineSync,
  type PendingRecord,
} from "@/lib/offline-queue";
import { useOnline } from "@/lib/use-online";
import { usePendingRecords } from "@/lib/use-pending-records";

/** Fila de registros feitos sem internet, com envio manual e descarte. */
export function PendingRecordsView() {
  const { isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const online = useOnline();
  const bg = isDark ? COLORS.dark.background : COLORS.light.background;
  const records = usePendingRecords();

  function handleDelete(id: string) {
    Alert.alert(
      "Descartar registro",
      "Tem certeza que deseja descartar este registro pendente? Esta ação não pode ser desfeita.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Descartar",
          style: "destructive",
          onPress: () => void removePendingRecord(id),
        },
      ]
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
          gap: 12,
        }}
      >
        {records === undefined ? (
          <View className="items-center justify-center py-24">
            <ActivityIndicator size="large" />
          </View>
        ) : records.length === 0 ? (
          <Card className="items-center gap-3 py-12">
            <CheckCircle2 size={48} color="#16a34a" />
            <Text className="text-center text-base font-medium text-foreground">
              Nenhum registro pendente
            </Text>
            <Text className="px-6 text-center text-sm text-muted-foreground">
              Tudo sincronizado. Registros feitos sem internet aparecem aqui até
              serem enviados.
            </Text>
          </Card>
        ) : (
          <>
            <View className="flex-row items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3">
              <CloudUpload size={18} color="#92400e" />
              <Text className="flex-1 text-sm text-amber-800">
                {records.length} registro{records.length > 1 ? "s" : ""} aguardando
                envio.
                {online ? " Tentando enviar..." : " Sem internet no momento."}
              </Text>
            </View>

            <Button
              className="w-full"
              disabled={!online}
              onPress={() => requestOfflineSync()}
            >
              <CloudUpload size={18} color="#fafafa" />
              <ButtonText className="ml-2">Enviar agora</ButtonText>
            </Button>

            {records.map((record) => (
              <PendingCard key={record.id} record={record} onDelete={handleDelete} />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function PendingCard({
  record,
  onDelete,
}: {
  record: PendingRecord;
  onDelete: (id: string) => void;
}) {
  const date = new Date(record.createdAt).toLocaleString("pt-BR");
  const title =
    record.kind === "equipment"
      ? "Cadastro de equipamento"
      : `Registro de ${getMaintenanceLogTypeLabel(record.logType)}`;
  const projectName = record.kind === "equipment" ? record.projectName : undefined;

  return (
    <Card>
      <CardContent className="gap-2">
        <View className="flex-row items-start justify-between">
          <View className="flex-1 flex-row items-center gap-2 pr-2">
            <Wrench size={16} color="#737373" />
            <Text className="flex-1 text-base font-semibold text-foreground">
              {title}
            </Text>
          </View>
          <StatusBadge status={record.status} />
        </View>

        <Text className="text-xs text-muted-foreground">QR: {record.qrToken}</Text>
        {projectName ? (
          <View className="flex-row items-center gap-1.5">
            <Building2 size={12} color="#9ca3af" />
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {projectName}
            </Text>
          </View>
        ) : null}
        <Text className="text-xs text-muted-foreground">{date}</Text>
        <Text className="text-xs text-muted-foreground">
          {record.photos.length} foto{record.photos.length === 1 ? "" : "s"}
        </Text>

        {record.error ? (
          <View className="flex-row items-center gap-1.5 rounded-md bg-destructive/10 px-3 py-2">
            <AlertTriangle size={14} color="#ef4444" />
            <Text className="flex-1 text-xs text-destructive">{record.error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => onDelete(record.id)}
          className="mt-1 flex-row items-center justify-center gap-2 py-1.5"
          accessibilityRole="button"
        >
          <Trash2 size={16} color="#ef4444" />
          <Text className="text-sm text-destructive">Descartar</Text>
        </Pressable>
      </CardContent>
    </Card>
  );
}
