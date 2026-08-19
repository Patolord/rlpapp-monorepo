import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { Building2, ChevronDown, ChevronUp, MapPin } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Badge, EmptyState, LoadingState } from "@rlpapp/ui/native";
import { Card } from "@/components/ui/card";

const statusConfig: Record<string, { label: string; variant: "info" | "success" | "warning" | "neutral" }> = {
  planning: { label: "Planejamento", variant: "neutral" },
  in_progress: { label: "Em andamento", variant: "info" },
  completed: { label: "Concluída", variant: "success" },
  paused: { label: "Pausada", variant: "warning" },
};

export default function PortalProjectScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const navigation = useNavigation();
  const [now] = useState(() => Date.now());

  const summary = useQuery(
    api.portal.getProjectSummary,
    projectId ? { projectId: projectId as Id<"projects">, now } : "skip"
  );

  const hierarchy = useQuery(
    api.portal.getProjectHierarchy,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip"
  );

  useEffect(() => {
    if (summary?.name) {
      const prefix = summary.legacyNumber ? `${summary.legacyNumber} – ` : "";
      navigation.setOptions({ title: `${prefix}${summary.name}` });
    }
  }, [summary, navigation]);

  if (summary === undefined || hierarchy === undefined) {
    return <LoadingState label="Carregando obra…" />;
  }

  if (summary === null) {
    return (
      <View className="flex-1 justify-center px-5">
        <EmptyState
          icon={<Building2 size={28} color="#6366f1" />}
          title="Obra não encontrada"
          description="A obra solicitada não existe ou você não tem acesso."
        />
      </View>
    );
  }

  const cfg = statusConfig[summary.status ?? ""] ?? statusConfig.planning;

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Summary */}
      <Card className="gap-3 p-5">
        <View className="flex-row items-start justify-between">
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-lg font-bold text-foreground">
              {summary.legacyNumber ? `${summary.legacyNumber} – ` : ""}
              {summary.name}
            </Text>
            {summary.client ? (
              <Text className="text-sm text-muted-foreground">{summary.client}</Text>
            ) : null}
            {summary.address ? (
              <View className="mt-0.5 flex-row items-center gap-1">
                <MapPin size={12} color="#9ca3af" />
                <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                  {summary.address}
                </Text>
              </View>
            ) : null}
          </View>
          <Badge variant={cfg.variant}>{cfg.label}</Badge>
        </View>

        <View className="gap-1.5">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs text-muted-foreground">
              {summary.installed}/{summary.total} instalados
            </Text>
            <Text className="text-sm font-bold text-foreground">{summary.pct}%</Text>
          </View>
          <View className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <View
              className="h-full rounded-full bg-primary"
              style={{ width: `${summary.pct}%` }}
            />
          </View>
        </View>

        {summary.overdue > 0 ? (
          <View className="mt-1 flex-row items-center gap-2">
            <Badge variant="danger">{`${summary.overdue} em atraso`}</Badge>
          </View>
        ) : null}

        {(summary.startDate || summary.endDate) ? (
          <View className="mt-1 flex-row gap-4">
            {summary.startDate ? (
              <View>
                <Text className="text-xs text-muted-foreground">Início</Text>
                <Text className="text-sm font-medium text-foreground">
                  {new Date(summary.startDate).toLocaleDateString("pt-BR")}
                </Text>
              </View>
            ) : null}
            {summary.endDate ? (
              <View>
                <Text className="text-xs text-muted-foreground">Previsão</Text>
                <Text className="text-sm font-medium text-foreground">
                  {new Date(summary.endDate).toLocaleDateString("pt-BR")}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </Card>

      {/* Hierarchy */}
      <View className="gap-3">
        <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Estrutura da Obra
        </Text>

        {hierarchy && "towers" in hierarchy && hierarchy.towers.length > 0 ? (
          <View className="gap-2">
            {hierarchy.towers.map((tower: HierarchyTower) => (
              <TowerSection key={tower._id} tower={tower} />
            ))}
          </View>
        ) : (
          <EmptyState
            variant="plain"
            title="Sem edificações"
            description="Nenhuma edificação cadastrada para esta obra."
          />
        )}
      </View>
    </ScrollView>
  );
}

interface HierarchyFloor {
  _id: string;
  label: string;
  number: number;
  totalItems: number;
  installedItems: number;
  environments: { _id: string; name: string }[];
}

interface HierarchyTower {
  _id: string;
  name: string;
  order: number;
  floors: HierarchyFloor[];
}

function TowerSection({ tower }: { tower: HierarchyTower }) {
  const [expanded, setExpanded] = useState(true);
  const totalItems = tower.floors.reduce((sum, f) => sum + f.totalItems, 0);
  const installedItems = tower.floors.reduce((sum, f) => sum + f.installedItems, 0);
  const pct = totalItems === 0 ? 0 : Math.round((installedItems / totalItems) * 100);
  const sortedFloors = tower.floors.slice().sort((a, b) => b.number - a.number);

  return (
    <Card className="p-4">
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        className="flex-row items-center justify-between"
      >
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="font-semibold text-foreground">{tower.name}</Text>
          <Text className="text-xs text-muted-foreground">
            {installedItems}/{totalItems} itens · {pct}%
          </Text>
        </View>
        {expanded ? (
          <ChevronUp size={18} color="#9ca3af" />
        ) : (
          <ChevronDown size={18} color="#9ca3af" />
        )}
      </Pressable>

      {expanded ? (
        <View className="mt-3 gap-2">
          {sortedFloors.map((floor) => {
            const floorPct =
              floor.totalItems === 0
                ? 0
                : Math.round((floor.installedItems / floor.totalItems) * 100);

            return (
              <View key={floor._id} className="gap-1">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm text-foreground">{floor.label}</Text>
                  <Text className="text-xs text-muted-foreground">
                    {floor.installedItems}/{floor.totalItems} ({floorPct}%)
                  </Text>
                </View>
                <View className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <View
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${floorPct}%` }}
                  />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </Card>
  );
}
