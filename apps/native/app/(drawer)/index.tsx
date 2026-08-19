import { api } from "@rlpapp/backend/convex/_generated/api";
import { useAuth } from "@clerk/clerk-expo";
import { Authenticated, Unauthenticated, AuthLoading, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter, Link } from "expo-router";
import type { Href } from "expo-router";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronRight,
  HardHat,
  Lock,
  Package,
  QrCode,
  ScanLine,
  ShoppingCart,
  Users,
  Warehouse,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { Container } from "@/components/container";
import { Button, ButtonText } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SignOutButton } from "@/components/sign-out-button";

type Overview = FunctionReturnType<typeof api.dashboard.getDirectorOverview>;

export default function HomeScreen() {
  return (
    <Container className="px-0 pt-0 pb-0">
      <Authenticated>
        <RoleAwareHome />
      </Authenticated>
      <Unauthenticated>
        <View className="flex-1 items-center justify-center px-5">
          <Card className="w-full items-center p-6">
            <Lock size={48} color="#888" />
            <Text className="mt-4 font-medium text-foreground">Bem-vindo ao RLP Engenharia</Text>
            <Text className="mt-2 text-center text-sm text-muted-foreground">
              Faça login para acessar o sistema
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
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      </AuthLoading>
    </Container>
  );
}

function RoleAwareHome() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const router = useRouter();
  const isDirector = currentUser?.role === "director";

  useEffect(() => {
    if (currentUser === undefined) return;
    if (currentUser === null) return;
    if (!isDirector) {
      const dest =
        currentUser.role === "engenheiro"
          ? "/(drawer)/engenharia"
          : `/(drawer)/${currentUser.department ?? "engenharia"}`;
      router.replace(dest as Href);
    }
  }, [currentUser, isDirector, router]);

  if (currentUser === undefined) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!isDirector) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-muted-foreground">Redirecionando...</Text>
      </View>
    );
  }

  return <DirectorDashboard />;
}

function greetingForHour(hour: number): string {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function DirectorDashboard() {
  const [now] = useState(() => Date.now());
  const currentUser = useQuery(api.users.getCurrentUser);
  const overview = useQuery(api.dashboard.getDirectorOverview, { now });
  const router = useRouter();

  const firstName = currentUser?.name?.split(" ")[0] ?? "";
  const date = new Date(now);
  const greeting = greetingForHour(date.getHours());
  const dateLabel = date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 20 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="gap-1">
        <Text className="text-2xl font-bold tracking-tight text-foreground">
          {greeting}
          {firstName ? `, ${firstName}` : ""}
        </Text>
        <Text className="text-sm capitalize text-muted-foreground">{dateLabel}</Text>
      </View>

      {overview === undefined ? (
        <DashboardSkeleton />
      ) : (
        <>
          <KpiBand kpis={overview.kpis} />
          <DepartmentNav />
          <ProjectsSection projects={overview.projects} now={now} />
          <CriticalPendingSection pending={overview.criticalPending} />
          <RecentActivitySection activity={overview.recentActivity} now={now} />
          <WeeklySummarySection summary={overview.weeklySummary} />
        </>
      )}
    </ScrollView>
  );
}

function KpiBand({ kpis }: { kpis: Overview["kpis"] }) {
  const cells = [
    { label: "Obras ativas", value: kpis.activeProjects.toString() },
    { label: "Equipamentos", value: kpis.totalEquipment.toString() },
    { label: "Checklists", value: `${kpis.checklistCompliance}%` },
    { label: "QR Codes", value: kpis.qrTotal.toString() },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 12 }}
    >
      {cells.map((cell) => (
        <Card key={cell.label} className="w-36 p-4">
          <Text className="text-2xl font-bold text-foreground">{cell.value}</Text>
          <Text className="mt-1 text-xs text-muted-foreground">{cell.label}</Text>
        </Card>
      ))}
    </ScrollView>
  );
}

const departments = [
  { route: "/(drawer)/engenharia", title: "Engenharia", icon: HardHat, color: "#f59e0b" },
  { route: "/(drawer)/compras", title: "Compras", icon: ShoppingCart, color: "#3b82f6" },
  { route: "/(drawer)/estoque", title: "Estoque", icon: Warehouse, color: "#10b981" },
  { route: "/(drawer)/rh", title: "RH", icon: Users, color: "#8b5cf6" },
  { route: "/(drawer)/portal", title: "Portal", icon: Building2, color: "#6366f1" },
] as const;

function DepartmentNav() {
  const router = useRouter();

  return (
    <View className="gap-2">
      <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Departamentos
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10 }}
      >
        {departments.map((dept) => (
          <Pressable
            key={dept.route}
            onPress={() => router.push(dept.route as Href)}
          >
            <Card className="w-28 items-center gap-2 p-4">
              <View
                className="h-10 w-10 items-center justify-center rounded-full"
                style={{ backgroundColor: `${dept.color}20` }}
              >
                <dept.icon size={20} color={dept.color} />
              </View>
              <Text className="text-xs font-semibold text-foreground">{dept.title}</Text>
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const statusLabels: Record<string, string> = {
  planning: "Planejamento",
  in_progress: "Em andamento",
  completed: "Concluída",
  paused: "Pausada",
};

function ProjectsSection({
  projects,
  now,
}: {
  projects: Overview["projects"];
  now: number;
}) {
  const router = useRouter();

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Andamento das obras
        </Text>
        <Pressable onPress={() => router.push("/(drawer)/engenharia/obras" as Href)}>
          <Text className="text-xs font-medium text-primary">Ver todas</Text>
        </Pressable>
      </View>

      {projects.length === 0 ? (
        <Card className="items-center py-8">
          <Text className="text-sm text-muted-foreground">Nenhuma obra ativa.</Text>
        </Card>
      ) : (
        <View className="gap-2">
          {projects.slice(0, 5).map((project) => (
            <Pressable
              key={project._id}
              onPress={() =>
                router.push({
                  pathname: "/obra/[projectId]",
                  params: { projectId: project._id },
                })
              }
            >
              <Card className="gap-2 p-4">
                <View className="flex-row items-center justify-between">
                  <View className="min-w-0 flex-1">
                    <Text className="font-semibold text-foreground" numberOfLines={1}>
                      {project.name}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {statusLabels[project.status ?? ""] ?? "Obra"}
                    </Text>
                  </View>
                  <Text className="text-sm font-bold text-foreground">{project.pct}%</Text>
                </View>
                <View className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <View
                    className={`h-full rounded-full ${project.overdue ? "bg-red-500" : "bg-primary"}`}
                    style={{ width: `${project.pct}%` }}
                  />
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function CriticalPendingSection({
  pending,
}: {
  pending: Overview["criticalPending"];
}) {
  const items = [
    {
      show: pending.overdueProjects > 0,
      critical: true,
      title: `${pending.overdueProjects} ${pending.overdueProjects === 1 ? "obra atrasada" : "obras atrasadas"}`,
    },
    {
      show: pending.environmentsWithoutEquipment > 0,
      critical: false,
      title: `${pending.environmentsWithoutEquipment} ambientes sem equipamento`,
    },
    {
      show: pending.openWorkItems > 0,
      critical: false,
      title: `${pending.openWorkItems} itens de serviço abertos`,
    },
  ].filter((i) => i.show);

  if (items.length === 0) return null;

  return (
    <View className="gap-3">
      <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Pendências críticas
      </Text>
      <Card className="gap-1 p-4">
        {items.map((item) => (
          <View key={item.title} className="flex-row items-center gap-3 py-2">
            <View
              className={`h-2 w-2 rounded-full ${item.critical ? "bg-red-500" : "bg-muted-foreground"}`}
            />
            <Text className="flex-1 text-sm font-medium text-foreground">{item.title}</Text>
            <ChevronRight size={16} color="#9ca3af" />
          </View>
        ))}
      </Card>
    </View>
  );
}

const actionLabels: Record<string, string> = {
  installed: "Equipamento instalado",
  tested: "Equipamento testado",
  finalized: "Equipamento finalizado",
  status_changed: "Status alterado",
  created: "Equipamento criado",
  updated: "Equipamento atualizado",
  assigned: "Equipamento atribuído",
  linked: "Equipamento vinculado",
  unlinked: "Equipamento desvinculado",
};

function relativeTime(from: number, now: number): string {
  const diff = Math.max(0, now - from);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
}

function RecentActivitySection({
  activity,
  now,
}: {
  activity: Overview["recentActivity"];
  now: number;
}) {
  if (activity.length === 0) return null;

  return (
    <View className="gap-3">
      <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Atividades recentes
      </Text>
      <Card className="gap-0 p-4">
        {activity.slice(0, 5).map((item) => (
          <View key={item._id} className="flex-row items-center gap-3 py-2.5">
            <View className="h-8 w-8 items-center justify-center rounded-lg bg-muted">
              <ScanLine size={14} color="#6b7280" />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
                {actionLabels[item.action] ?? item.action}
              </Text>
              <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                {item.equipmentLabel} · {relativeTime(item.createdAt, now)}
              </Text>
            </View>
          </View>
        ))}
      </Card>
    </View>
  );
}

function WeeklySummarySection({
  summary,
}: {
  summary: Overview["weeklySummary"];
}) {
  const cells = [
    { value: summary.checklistsCompleted, label: "Checklists" },
    { value: summary.equipmentRegistered, label: "Equipamentos" },
    { value: summary.environmentsUpdated, label: "Ambientes" },
    { value: summary.maintenanceLogs, label: "Registros" },
  ];

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Resumo semanal
        </Text>
        <View className="rounded-md border border-border px-2 py-0.5">
          <Text className="text-xs text-muted-foreground">Esta semana</Text>
        </View>
      </View>
      <Card className="flex-row justify-around p-5">
        {cells.map((cell) => (
          <View key={cell.label} className="items-center gap-1">
            <Text className="text-xl font-bold text-foreground">{cell.value}</Text>
            <Text className="text-xs text-muted-foreground">{cell.label}</Text>
          </View>
        ))}
      </Card>
    </View>
  );
}

function DashboardSkeleton() {
  return (
    <View className="gap-4">
      <View className="h-24 rounded-xl bg-muted" />
      <View className="h-16 rounded-xl bg-muted" />
      <View className="h-48 rounded-xl bg-muted" />
      <View className="h-32 rounded-xl bg-muted" />
    </View>
  );
}
