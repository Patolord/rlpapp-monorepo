import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { EmptyState, LoadingState } from "@rlpapp/ui/native";
import { useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Building2, ExternalLink, Snowflake, Wind } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

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
import { getUnitState, TYPE_LABELS, type GridItem, type GridUnit } from "@/lib/building";
import type { EquipmentStatus } from "@/lib/equipment-status";

export default function PredioScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const now = Date.now();
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

  const project = useQuery(api.projects.getOverview, {
    projectId: projectId as Id<"projects">,
  });

  if (project === undefined) {
    return <LoadingState label="Carregando prédio…" />;
  }

  if (project === null) {
    return (
      <EmptyState
        icon={<Building2 size={24} color="#f59e0b" />}
        title="Obra não encontrada"
        variant="plain"
        className="flex-1"
      />
    );
  }

  const selectedUnit =
    project.units.find((u) => u._id === selectedUnitId) ?? null;

  return (
    <>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <Card className="gap-4">
          {project.units.length === 0 ? (
            <EmptyState
              icon={<Building2 size={24} color="#f59e0b" />}
              title="Nenhum apartamento"
              description="Nenhum apartamento cadastrado nesta obra ainda."
              variant="plain"
            />
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

      <ApartmentDialog
        unit={selectedUnit}
        now={now}
        onClose={() => setSelectedUnitId(null)}
      />
    </>
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
                <EquipmentItemRow
                  key={item._id}
                  item={item}
                  onNavigate={onClose}
                />
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
