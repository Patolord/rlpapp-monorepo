import { api } from "@rlpapp/backend/convex/_generated/api";
import { usePaginatedQuery } from "convex/react";
import { useRouter } from "expo-router";
import {
  AlertTriangle,
  Calendar,
  Camera,
  ChevronRight,
  CloudOff,
  CloudUpload,
  History,
  QrCode,
  Search,
  Trash2,
} from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

import { Badge } from "@/components/ui/badge";
import { Button, ButtonText } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/engenharia/status-badge";
import type { EquipmentStatus } from "@/lib/equipment-status";
import { getMaintenanceLogTypeLabel } from "@/lib/maintenance-log-type";
import {
  listPendingRecords,
  removePendingRecord,
  requestOfflineSync,
  subscribeQueue,
  type PendingRecord,
} from "@/lib/offline-queue";
import { useOnline } from "@/lib/use-online";

export default function RegistroDeCampoScreen() {
  const router = useRouter();
  const online = useOnline();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<PendingRecord[]>([]);

  const refresh = useCallback(() => {
    void listPendingRecords().then(setPending);
  }, []);

  useEffect(() => {
    refresh();
    const unsubscribe = subscribeQueue(refresh);
    return () => unsubscribe();
  }, [refresh]);

  function handleOpen() {
    const token = code.trim().toUpperCase().replace(/\s+/g, "");
    if (!token) return;
    router.push({ pathname: "/equipamento/[token]", params: { token } });
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 16 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View>
        <Text className="text-2xl font-bold text-foreground">
          Registro de Campo
        </Text>
        <Text className="mt-1 text-muted-foreground">
          Abra um equipamento pelo código da etiqueta.
        </Text>
      </View>

      {!online && (
        <View className="flex-row items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3">
          <CloudOff size={20} color="#92400e" />
          <Text className="flex-1 text-sm text-amber-800">
            Sem internet. Você pode registrar mesmo assim — tudo fica salvo no
            aparelho e é enviado quando a conexão voltar.
          </Text>
        </View>
      )}

      <Card>
        <CardHeader>
          <View className="flex-row items-center gap-2">
            <QrCode size={18} color="#737373" />
            <CardTitle>Registrar por código</CardTitle>
          </View>
        </CardHeader>
        <CardContent className="gap-3">
          <Text className="text-sm text-muted-foreground">
            Digite o código impresso na etiqueta do QR (ex: LORENAH4FC29) para
            abrir o equipamento sem escanear.
          </Text>
          <Input
            placeholder="Ex: LORENAH4FC29"
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            className="h-14 font-mono text-lg"
            onSubmitEditing={handleOpen}
            returnKeyType="go"
          />
          <Button
            className="h-14 w-full"
            disabled={!code.trim()}
            onPress={handleOpen}
          >
            <Search size={20} color="#fafafa" />
            <ButtonText className="ml-2 text-base">Abrir equipamento</ButtonText>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <CloudUpload size={18} color="#737373" />
              <CardTitle>Registros pendentes</CardTitle>
            </View>
            {pending.length > 0 && (
              <Badge variant="secondary">{String(pending.length)}</Badge>
            )}
          </View>
        </CardHeader>
        <CardContent className="gap-3">
          {pending.length === 0 ? (
            <Text className="text-sm text-muted-foreground">
              Nenhum registro aguardando envio.
            </Text>
          ) : (
            <>
              {pending.map((record) => (
                <PendingRecordCard key={record.id} record={record} />
              ))}
              <Button
                className="h-12 w-full"
                disabled={!online}
                onPress={() => requestOfflineSync()}
              >
                <CloudUpload size={18} color="#fafafa" />
                <ButtonText className="ml-2 text-base">
                  {online ? "Enviar agora" : "Sem internet para enviar"}
                </ButtonText>
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <SentHistory />
    </ScrollView>
  );
}

function SentHistory() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.maintenanceLogs.listMine,
    {},
    { initialNumItems: 10 }
  );

  return (
    <Card>
      <CardHeader>
        <View className="flex-row items-center gap-2">
          <History size={18} color="#737373" />
          <CardTitle>Histórico enviado</CardTitle>
        </View>
      </CardHeader>
      <CardContent className="gap-3">
        {status === "LoadingFirstPage" ? (
          <Text className="text-sm text-muted-foreground">Carregando...</Text>
        ) : results.length === 0 ? (
          <Text className="text-sm text-muted-foreground">
            Nenhum registro enviado ainda.
          </Text>
        ) : (
          <>
            {results.map((log) => (
              <SentLogCard key={log._id} log={log} />
            ))}
            {status === "CanLoadMore" && (
              <Button
                variant="outline"
                className="h-11 w-full"
                onPress={() => loadMore(10)}
              >
                <ButtonText variant="outline" className="text-base">
                  Carregar mais
                </ButtonText>
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

type SentLog = {
  _id: string;
  type?: "installation" | "maintenance";
  status: EquipmentStatus;
  createdAt: number;
  qrToken: string | null;
  equipment: { description?: string } | null;
};

function SentLogCard({ log }: { log: SentLog }) {
  const router = useRouter();
  const date = new Date(log.createdAt).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const title = log.equipment?.description || log.qrToken || "Equipamento";

  const body = (
    <View className="flex-row items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
      <View className="min-w-0 flex-1 gap-1.5">
        <View className="flex-row flex-wrap items-center gap-2">
          <Badge variant={log.type === "installation" ? "default" : "secondary"}>
            {getMaintenanceLogTypeLabel(log.type ?? "maintenance")}
          </Badge>
          <StatusBadge status={log.status} />
        </View>
        <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
          {title}
        </Text>
        <View className="flex-row items-center gap-1.5">
          <Calendar size={13} color="#9ca3af" />
          <Text className="text-xs text-muted-foreground">{date}</Text>
        </View>
      </View>
      {log.qrToken && <ChevronRight size={18} color="#9ca3af" />}
    </View>
  );

  if (!log.qrToken) return body;

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/equipamento/[token]",
          params: { token: log.qrToken as string },
        })
      }
    >
      {body}
    </Pressable>
  );
}

function PendingRecordCard({ record }: { record: PendingRecord }) {
  const date = new Date(record.createdAt).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  function handleDiscard() {
    Alert.alert(
      "Descartar registro",
      "Descartar este registro pendente? Os dados serão perdidos.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Descartar",
          style: "destructive",
          onPress: () => void removePendingRecord(record.id),
        },
      ]
    );
  }

  return (
    <View className="rounded-lg border border-border/60 p-3">
      <View className="flex-row items-start justify-between gap-2">
        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <Badge
              variant={record.kind === "equipment" ? "default" : "secondary"}
            >
              {record.kind === "equipment"
                ? "Cadastro de equipamento"
                : record.logType === "installation"
                  ? "Instalação"
                  : "Manutenção"}
            </Badge>
            <Text className="font-mono text-sm font-semibold text-foreground">
              {record.qrToken}
            </Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <Camera size={12} color="#9ca3af" />
            <Text className="text-xs text-muted-foreground">
              {date} · {record.photos.length} foto
              {record.photos.length === 1 ? "" : "s"}
            </Text>
          </View>
          {record.kind === "equipment" && (
            <Text className="text-sm text-foreground" numberOfLines={1}>
              {record.description}
            </Text>
          )}
          {record.error && (
            <View className="flex-row items-start gap-1.5">
              <AlertTriangle size={13} color="#ef4444" />
              <Text className="flex-1 text-xs text-destructive">
                {record.error}
              </Text>
            </View>
          )}
        </View>
        <Pressable onPress={handleDiscard} hitSlop={8} className="p-1">
          <Trash2 size={16} color="#ef4444" />
        </Pressable>
      </View>
    </View>
  );
}
