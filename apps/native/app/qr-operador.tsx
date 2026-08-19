import { api } from "@rlpapp/backend/convex/_generated/api";
import { useAuth } from "@clerk/clerk-expo";
import { Authenticated, Unauthenticated, AuthLoading, useQuery } from "convex/react";
import { useRouter, Link, type Href } from "expo-router";
import {
  Building2,
  ChevronRight,
  ClipboardList,
  Keyboard,
  QrCode,
  ScanLine,
  WifiOff,
} from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Badge, LoadingState } from "@rlpapp/ui/native";
import { Card } from "@/components/ui/card";
import { Button, ButtonText } from "@/components/ui/button";
import { SignOutButton } from "@/components/sign-out-button";
import { listPendingRecords, subscribeQueue } from "@/lib/offline-queue";
import { useAppTheme } from "@/contexts/app-theme-context";
import { COLORS } from "@/lib/colors";

function usePendingCount() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    const records = await listPendingRecords();
    setCount(records.length);
  }, []);

  useEffect(() => {
    refresh();
    const unsub = subscribeQueue(() => {
      refresh();
    });
    return unsub;
  }, [refresh]);

  return count;
}

export default function QrOperadorScreen() {
  return (
    <>
      <Authenticated>
        <OperatorHub />
      </Authenticated>
      <Unauthenticated>
        <View className="flex-1 items-center justify-center px-5">
          <Card className="w-full items-center p-6">
            <QrCode size={48} color="#888" />
            <Text className="mt-4 font-medium text-foreground">QR Operador</Text>
            <Text className="mt-2 text-center text-sm text-muted-foreground">
              Faça login para acessar o hub de operações.
            </Text>
            <Link href="/(auth)/sign-in" asChild>
              <Button className="mt-4">
                <ButtonText>Entrar</ButtonText>
              </Button>
            </Link>
          </Card>
        </View>
      </Unauthenticated>
      <AuthLoading>
        <LoadingState />
      </AuthLoading>
    </>
  );
}

const statusLabels: Record<string, string> = {
  planning: "Planejamento",
  in_progress: "Em andamento",
  completed: "Concluída",
  paused: "Pausada",
};

function OperatorHub() {
  const router = useRouter();
  const pendingCount = usePendingCount();
  const projects = useQuery(api.portal.listMyProjects);
  const { isDark } = useAppTheme();

  const surface = isDark ? "#1b2433" : "#f8fafc";

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 20 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header area */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <QrCode size={22} color="#3b82f6" />
          </View>
          <View>
            <Text className="text-xl font-bold text-foreground">QR Operador</Text>
            <Text className="text-xs text-muted-foreground">Hub de operações</Text>
          </View>
        </View>
        <SignOutButton />
      </View>

      {/* Pending offline banner */}
      {pendingCount > 0 ? (
        <Pressable onPress={() => router.push("/pendentes" as Href)}>
          <Card className="flex-row items-center gap-3 border-yellow-500/30 bg-yellow-50 p-4 dark:bg-yellow-950/30">
            <WifiOff size={20} color="#d97706" />
            <View className="min-w-0 flex-1">
              <Text className="font-medium text-yellow-800 dark:text-yellow-300">
                {pendingCount} {pendingCount === 1 ? "registro pendente" : "registros pendentes"}
              </Text>
              <Text className="text-xs text-yellow-700 dark:text-yellow-400">
                Aguardando conexão para sincronizar
              </Text>
            </View>
            <ChevronRight size={16} color="#d97706" />
          </Card>
        </Pressable>
      ) : null}

      {/* Main actions */}
      <View className="gap-3">
        <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Ações rápidas
        </Text>

        <Pressable onPress={() => router.push("/scanner" as Href)}>
          <Card className="flex-row items-center gap-4 p-5" style={{ backgroundColor: surface }}>
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-primary">
              <ScanLine size={28} color="#ffffff" />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-base font-semibold text-foreground">
                Escanear QR Code
              </Text>
              <Text className="text-xs text-muted-foreground">
                Abrir câmera para leitura
              </Text>
            </View>
            <ChevronRight size={20} color="#9ca3af" />
          </Card>
        </Pressable>

        <Pressable
          onPress={() =>
            router.push({
              pathname: "/meus-registros" as Href,
              params: { action: "manual" },
            })
          }
        >
          <Card className="flex-row items-center gap-4 p-4" style={{ backgroundColor: surface }}>
            <View className="h-11 w-11 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-950">
              <Keyboard size={22} color="#3b82f6" />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="font-medium text-foreground">Digitar código da etiqueta</Text>
              <Text className="text-xs text-muted-foreground">Entrada manual do token</Text>
            </View>
            <ChevronRight size={18} color="#9ca3af" />
          </Card>
        </Pressable>

        <Pressable
          onPress={() =>
            router.push({
              pathname: "/meus-registros" as Href,
              params: { action: "history" },
            })
          }
        >
          <Card className="flex-row items-center gap-4 p-4" style={{ backgroundColor: surface }}>
            <View className="h-11 w-11 items-center justify-center rounded-xl bg-green-100 dark:bg-green-950">
              <ClipboardList size={22} color="#10b981" />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="font-medium text-foreground">Meus registros</Text>
              <Text className="text-xs text-muted-foreground">Histórico de atividades</Text>
            </View>
            <ChevronRight size={18} color="#9ca3af" />
          </Card>
        </Pressable>
      </View>

      {/* Projects */}
      <View className="gap-3">
        <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Buscar etiqueta por obra
        </Text>

        {projects === undefined ? (
          <LoadingState size="small" className="py-8" />
        ) : projects.length === 0 ? (
          <Card className="items-center py-6">
            <Text className="text-sm text-muted-foreground">Nenhuma obra disponível.</Text>
          </Card>
        ) : (
          <View className="gap-2">
            {projects.map((project) => (
              <Pressable
                key={project._id}
                onPress={() =>
                  router.push({
                    pathname: "/portal-projeto/[projectId]",
                    params: { projectId: project._id },
                  })
                }
              >
                <Card className="flex-row items-center gap-3 p-4">
                  <Building2 size={18} color="#6366f1" />
                  <View className="min-w-0 flex-1">
                    <Text className="font-medium text-foreground" numberOfLines={1}>
                      {project.legacyNumber ? `${project.legacyNumber} – ` : ""}
                      {project.name}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {statusLabels[project.status ?? ""] ?? "Obra"} · {project.pct}%
                    </Text>
                  </View>
                  <ChevronRight size={16} color="#9ca3af" />
                </Card>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
