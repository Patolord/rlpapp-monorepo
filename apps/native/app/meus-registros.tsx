import { api } from "@rlpapp/backend/convex/_generated/api";
import { usePaginatedQuery, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  Keyboard,
  ScanLine,
  WifiOff,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { Badge, EmptyState, LoadingState } from "@rlpapp/ui/native";
import { Card } from "@/components/ui/card";
import { Button, ButtonText } from "@/components/ui/button";
import { listPendingRecords, subscribeQueue, type PendingRecord } from "@/lib/offline-queue";
import { useAppTheme } from "@/contexts/app-theme-context";
import { COLORS } from "@/lib/colors";

type TabKey = "scan" | "manual" | "projects" | "history";

const TABS: { key: TabKey; label: string }[] = [
  { key: "scan", label: "Escanear" },
  { key: "manual", label: "Manual" },
  { key: "projects", label: "Obras" },
  { key: "history", label: "Histórico" },
];

function resolveInitialTab(action?: string): TabKey {
  if (action === "manual") return "manual";
  if (action === "history") return "history";
  if (action === "projects") return "projects";
  return "scan";
}

function usePendingCount() {
  const [records, setRecords] = useState<PendingRecord[]>([]);

  const refresh = useCallback(async () => {
    const list = await listPendingRecords();
    setRecords(list);
  }, []);

  useEffect(() => {
    void refresh();
    const unsub = subscribeQueue(() => {
      void refresh();
    });
    return unsub;
  }, [refresh]);

  return records;
}

export default function MeusRegistrosScreen() {
  const { action } = useLocalSearchParams<{ action?: string }>();
  const [tab, setTab] = useState<TabKey>(() => resolveInitialTab(action));
  const { isDark } = useAppTheme();
  const pendingRecords = usePendingCount();

  const bg = isDark ? COLORS.dark.background : COLORS.light.background;
  const activeBg = isDark ? "#2563eb" : "#3b82f6";

  return (
    <View className="flex-1" style={{ backgroundColor: bg }}>
      {/* Pending banner */}
      {pendingRecords.length > 0 ? (
        <View className="flex-row items-center gap-2 border-b border-yellow-500/20 bg-yellow-50 px-5 py-2.5 dark:bg-yellow-950/30">
          <WifiOff size={14} color="#d97706" />
          <Text className="text-xs font-medium text-yellow-800 dark:text-yellow-300">
            {pendingRecords.length} {pendingRecords.length === 1 ? "registro pendente" : "registros pendentes"} offline
          </Text>
        </View>
      ) : null}

      {/* Tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}
      >
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              className="rounded-full px-4 py-2"
              style={{
                backgroundColor: active ? activeBg : isDark ? "#1e293b" : "#f1f5f9",
              }}
            >
              <Text
                className="text-sm font-semibold"
                style={{ color: active ? "#ffffff" : isDark ? "#94a3b8" : "#64748b" }}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Content */}
      <View className="flex-1">
        {tab === "scan" && <ScanTab />}
        {tab === "manual" && <ManualTab />}
        {tab === "projects" && <ProjectsTab />}
        {tab === "history" && <HistoryTab />}
      </View>
    </View>
  );
}

function ScanTab() {
  const router = useRouter();

  return (
    <View className="flex-1 items-center justify-center gap-4 px-5">
      <View className="h-20 w-20 items-center justify-center rounded-3xl bg-primary/10">
        <ScanLine size={40} color="#3b82f6" />
      </View>
      <Text className="text-center text-lg font-semibold text-foreground">
        Escanear QR Code
      </Text>
      <Text className="text-center text-sm text-muted-foreground">
        Aponte a câmera para a etiqueta do equipamento.
      </Text>
      <Button className="mt-2 w-full" onPress={() => router.push("/scanner" as Href)}>
        <ButtonText>Abrir câmera</ButtonText>
      </Button>
    </View>
  );
}

function ManualTab() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const { isDark } = useAppTheme();

  function handleSubmit() {
    const trimmed = code.trim();
    if (!trimmed) return;
    const match = trimmed.match(/\/q\/([^/?#]+)/i);
    const token = match?.[1] ? decodeURIComponent(match[1]) : trimmed;
    router.push({ pathname: "/equipamento/[token]", params: { token } });
  }

  return (
    <View className="flex-1 px-5 pt-6 gap-5">
      <View className="items-center gap-3">
        <View className="h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 dark:bg-blue-950">
          <Keyboard size={28} color="#3b82f6" />
        </View>
        <Text className="text-center text-base font-semibold text-foreground">
          Digitar código da etiqueta
        </Text>
        <Text className="text-center text-sm text-muted-foreground">
          Insira o código QR ou a URL completa da etiqueta.
        </Text>
      </View>

      <View className="gap-3">
        <TextInput
          className="rounded-lg border border-input bg-card px-4 py-3 text-base text-foreground"
          placeholder="Ex: ABC123 ou https://...q/ABC123"
          placeholderTextColor="#9ca3af"
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
        />
        <Button onPress={handleSubmit} disabled={!code.trim()}>
          <ButtonText>Buscar equipamento</ButtonText>
        </Button>
      </View>
    </View>
  );
}

function ProjectsTab() {
  const router = useRouter();
  const projects = useQuery(api.portal.listMyProjects);

  if (projects === undefined) {
    return <LoadingState label="Carregando obras…" />;
  }

  if (projects.length === 0) {
    return (
      <View className="flex-1 justify-center px-5">
        <EmptyState
          icon={<Building2 size={28} color="#6366f1" />}
          title="Nenhuma obra"
          description="Nenhuma obra disponível para o seu acesso."
        />
      </View>
    );
  }

  return (
    <FlatList
      data={projects}
      keyExtractor={(item) => item._id}
      contentContainerStyle={{ padding: 20, gap: 8 }}
      renderItem={({ item }) => (
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/portal-projeto/[projectId]",
              params: { projectId: item._id },
            })
          }
        >
          <Card className="flex-row items-center gap-3 p-4">
            <Building2 size={18} color="#6366f1" />
            <View className="min-w-0 flex-1">
              <Text className="font-medium text-foreground" numberOfLines={1}>
                {item.legacyNumber ? `${item.legacyNumber} – ` : ""}
                {item.name}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {item.installed}/{item.total} · {item.pct}%
              </Text>
            </View>
            <ChevronRight size={16} color="#9ca3af" />
          </Card>
        </Pressable>
      )}
    />
  );
}

const logTypeLabels: Record<string, string> = {
  installation: "Instalação",
  maintenance: "Manutenção",
};

function HistoryTab() {
  const {
    results: logs,
    status,
    loadMore,
  } = usePaginatedQuery(api.maintenanceLogs.listMine, {}, { initialNumItems: 20 });

  if (status === "LoadingFirstPage") {
    return <LoadingState label="Carregando histórico…" />;
  }

  if (logs.length === 0) {
    return (
      <View className="flex-1 justify-center px-5">
        <EmptyState
          icon={<Clock size={28} color="#6366f1" />}
          title="Sem registros"
          description="Você ainda não possui registros de campo."
        />
      </View>
    );
  }

  return (
    <FlatList
      data={logs}
      keyExtractor={(item) => item._id}
      contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 8 }}
      renderItem={({ item }) => <LogCard log={item} />}
      onEndReached={() => {
        if (status === "CanLoadMore") loadMore(20);
      }}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        status === "LoadingMore" ? (
          <LoadingState size="small" className="py-4" />
        ) : null
      }
    />
  );
}

function LogCard({ log }: { log: { _id: string; logType: string; status: string; createdAt: number; equipment: { description: string } | null; qrToken: string | null } }) {
  const synced = true;

  return (
    <Card className="gap-2 p-4">
      <View className="flex-row items-start justify-between">
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="font-medium text-foreground" numberOfLines={1}>
            {log.equipment?.description ?? "Equipamento"}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {logTypeLabels[log.logType] ?? log.logType}
            {log.qrToken ? ` · ${log.qrToken}` : ""}
          </Text>
        </View>
        <Badge variant={synced ? "success" : "warning"}>
          {synced ? "Sincronizado" : "Pendente"}
        </Badge>
      </View>
      <View className="flex-row items-center gap-2">
        <Clock size={12} color="#9ca3af" />
        <Text className="text-xs text-muted-foreground">
          {new Date(log.createdAt).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>
    </Card>
  );
}
