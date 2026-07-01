import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Building2, ExternalLink, Snowflake, Wind } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { Badge } from "@/components/ui/badge";
import { Button, ButtonText } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BuildingView } from "@/components/engenharia/building-view";
import { StatusBadge } from "@/components/engenharia/status-badge";
import { useAppTheme } from "@/contexts/app-theme-context";
import { COLORS } from "@/lib/colors";
import { getUnitState, TYPE_LABELS, type GridItem, type GridUnit } from "@/lib/building";
import type { EquipmentStatus } from "@/lib/equipment-status";

export default function ObraDetailScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { isDark } = useAppTheme();
  const bg = isDark ? COLORS.dark.background : COLORS.light.background;

  const project = useQuery(api.projects.getOverview, {
    projectId: projectId as Id<"projects">,
  });
  const now = Date.now();
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

  const selectedUnit =
    project?.units.find((u) => u._id === selectedUnitId) ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <Stack.Screen options={{ title: project?.name ?? "Obra" }} />

      {project === undefined ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      ) : project === null ? (
        <NotFound />
      ) : (
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

          <StatsRow project={project} now={now} />

          <Card className="gap-4">
            {project.units.length === 0 ? (
              <Text className="py-8 text-center text-sm text-muted-foreground">
                Nenhum apartamento cadastrado nesta obra ainda.
              </Text>
            ) : (
              <BuildingView
                floors={project.floors}
                units={project.units}
                now={now}
                selectedUnitId={selectedUnitId}
                onSelectUnit={(u) => setSelectedUnitId(u._id)}
              />
            )}
          </Card>
        </ScrollView>
      )}

      <ApartmentDialog
        unit={selectedUnit}
        now={now}
        onClose={() => setSelectedUnitId(null)}
      />
    </View>
  );
}

function StatsRow({
  project,
  now,
}: {
  project: {
    totalItems: number;
    installedItems: number;
    units: GridUnit[];
  };
  now: number;
}) {
  const pending = project.totalItems - project.installedItems;
  const pct =
    project.totalItems === 0
      ? 0
      : Math.round((project.installedItems / project.totalItems) * 100);
  const overdue = project.units.filter((u) => getUnitState(u, now).overdue).length;

  return (
    <View className="flex-row flex-wrap gap-3">
      <StatTile label="Instalados" value={project.installedItems} accent />
      <StatTile label="Pendentes" value={pending} />
      <StatTile label="Em atraso" value={overdue} danger={overdue > 0} />
      <StatTile label="Progresso" value={`${pct}%`} />
    </View>
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

function ApartmentDialog({
  unit,
  now,
  onClose,
}: {
  unit: GridUnit | null;
  now: number;
  onClose: () => void;
}) {
  if (!unit) return null;
  const state = getUnitState(unit, now);

  // Agrupa equipamentos por sistema.
  const bySystem = new Map<string, GridItem[]>();
  for (const item of unit.equipment) {
    const list = bySystem.get(item.system) ?? [];
    list.push(item);
    bySystem.set(item.system, list);
  }

  return (
    <Dialog open={unit !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogHeader>
        <View className="flex-row items-center gap-2">
          <DialogTitle>Apto {unit.label}</DialogTitle>
          <Badge variant="outline">{TYPE_LABELS[unit.type]}</Badge>
        </View>
        <DialogDescription>
          {state.installed}/{state.total} equipamentos instalados
        </DialogDescription>
      </DialogHeader>

      <View className="gap-4">
        {unit.equipment.length === 0 ? (
          <Text className="py-4 text-center text-sm text-muted-foreground">
            Nenhum equipamento previsto para este apartamento.
          </Text>
        ) : (
          Array.from(bySystem.entries()).map(([system, items]) => (
            <View key={system} className="gap-2">
              <Text className="text-sm font-semibold text-foreground">
                {system}
              </Text>
              {items.map((item) => (
                <EquipmentItemRow key={item._id} item={item} onNavigate={onClose} />
              ))}
            </View>
          ))
        )}
      </View>
    </Dialog>
  );
}

function EquipmentItemRow({
  item,
  onNavigate,
}: {
  item: GridItem;
  onNavigate: () => void;
}) {
  const router = useRouter();

  function openEquipment() {
    if (!item.token) return;
    onNavigate();
    router.push({
      pathname: "/equipamento/[token]",
      params: { token: item.token },
    });
  }

  return (
    <View className="gap-1.5 rounded-lg border border-border/60 p-3">
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-1.5">
          {item.kind === "condensadora" ? (
            <Snowflake size={15} color="#2563eb" />
          ) : (
            <Wind size={15} color="#0891b2" />
          )}
          <Text className="text-sm font-medium text-foreground">
            {item.kind === "condensadora" ? "Condensadora" : "Evaporadora"}
          </Text>
        </View>
        <StatusBadge status={item.status as EquipmentStatus} />
      </View>

      <Text className="text-xs text-muted-foreground">
        {item.ambiente}
        {item.modelo ? ` · ${item.modelo}` : ""}
        {item.capacidade ? ` · ${item.capacidade}` : ""}
      </Text>

      {item.token && (
        <Button
          variant="outline"
          size="sm"
          className="mt-1 self-start"
          onPress={openEquipment}
        >
          <ExternalLink size={14} color="#1a1a2e" />
          <ButtonText variant="outline" className="ml-1.5 text-xs">
            Abrir equipamento
          </ButtonText>
        </Button>
      )}
    </View>
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
      <Button variant="outline" onPress={() => router.back()}>
        <ButtonText variant="outline">Voltar</ButtonText>
      </Button>
    </View>
  );
}
