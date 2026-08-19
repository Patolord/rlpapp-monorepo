import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { LoadingState } from "@rlpapp/ui/native";
import { useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Building2,
  Calculator,
  FileText,
  QrCode,
  Ruler,
  ShoppingCart,
  Warehouse,
  Wind,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Card } from "@/components/ui/card";
import { getUnitState, type GridUnit } from "@/lib/building";

interface ModuleTile {
  label: string;
  segment: string;
  icon: LucideIcon;
  color: string;
}

const MODULES: ModuleTile[] = [
  { label: "Prédio", segment: "predio", icon: Building2, color: "#3b82f6" },
  { label: "Orçamento", segment: "orcamento", icon: Calculator, color: "#8b5cf6" },
  { label: "Medições", segment: "medicoes", icon: Ruler, color: "#06b6d4" },
  { label: "Compras", segment: "compras", icon: ShoppingCart, color: "#f97316" },
  { label: "Estoque", segment: "estoque", icon: Warehouse, color: "#10b981" },
  { label: "Dutos", segment: "dutos", icon: Wind, color: "#0ea5e9" },
  { label: "Contratos", segment: "contratos", icon: FileText, color: "#eab308" },
  { label: "QR Codes", segment: "qr-codes", icon: QrCode, color: "#ec4899" },
];

export default function ProjectHubScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();
  const now = Date.now();

  const project = useQuery(api.projects.getOverview, {
    projectId: projectId as Id<"projects">,
  });

  function navigate(segment: string) {
    router.replace({
      pathname: `/obra/[projectId]/${segment}` as const,
      params: { projectId: projectId! },
    } as any);
  }

  if (project === undefined) {
    return <LoadingState label="Carregando obra…" />;
  }

  if (project === null) {
    return <NotFound />;
  }

  const pending = project.totalItems - project.installedItems;
  const pct =
    project.totalItems === 0
      ? 0
      : Math.round((project.installedItems / project.totalItems) * 100);
  const overdue = project.units.filter(
    (u: GridUnit) => getUnitState(u, now).overdue
  ).length;

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 20 }}
      showsVerticalScrollIndicator={false}
    >
      <View>
        <Text className="text-2xl font-bold text-foreground">
          {project.name}
        </Text>
        <Text className="mt-1 text-sm text-muted-foreground">
          {project.floors.length} andar
          {project.floors.length === 1 ? "" : "es"} · {project.units.length}{" "}
          apartamentos · {project.totalItems} equipamentos
        </Text>
      </View>

      {/* Stats */}
      <View className="flex-row flex-wrap gap-3">
        <StatTile label="Instalados" value={project.installedItems} accent />
        <StatTile label="Pendentes" value={pending} />
        <StatTile label="Em atraso" value={overdue} danger={overdue > 0} />
        <StatTile label="Progresso" value={`${pct}%`} />
      </View>

      {/* Progress bar */}
      <View className="h-2.5 overflow-hidden rounded-full bg-muted">
        <View
          className="h-full rounded-full bg-primary"
          style={{ width: `${pct}%` }}
        />
      </View>

      {/* Module grid */}
      <View className="flex-row flex-wrap gap-3">
        {MODULES.map((mod) => {
          const Icon = mod.icon;
          return (
            <Pressable
              key={mod.segment}
              onPress={() => navigate(mod.segment)}
              className="min-w-[45%] flex-1"
            >
              <Card className="items-center gap-3 p-5">
                <View
                  className="h-12 w-12 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${mod.color}20` }}
                >
                  <Icon size={24} color={mod.color} />
                </View>
                <Text className="text-sm font-semibold text-foreground">
                  {mod.label}
                </Text>
              </Card>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

function StatTile({
  label,
  value,
  accent = false,
  danger = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  danger?: boolean;
}) {
  const color = danger ? "#ef4444" : accent ? "#f59e0b" : "#1a1a2e";
  return (
    <Card className="min-w-[45%] flex-1 p-4">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Text className="mt-1 text-2xl font-bold" style={{ color }}>
        {value}
      </Text>
    </Card>
  );
}

function NotFound() {
  const router = useRouter();
  return (
    <View className="flex-1 items-center justify-center gap-4 p-8">
      <Building2 size={48} color="#9ca3af" />
      <Text className="text-xl font-bold text-foreground">
        Obra não encontrada
      </Text>
      <Text className="text-center text-sm text-muted-foreground">
        Esta obra pode ter sido removida.
      </Text>
      <Pressable onPress={() => router.back()}>
        <Text className="text-sm font-medium text-primary">Voltar</Text>
      </Pressable>
    </View>
  );
}
