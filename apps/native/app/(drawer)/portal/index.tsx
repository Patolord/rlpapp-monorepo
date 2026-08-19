import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { Building2, ChevronRight } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Badge, EmptyState, LoadingState } from "@rlpapp/ui/native";
import { Card } from "@/components/ui/card";

const statusConfig: Record<string, { label: string; variant: "info" | "success" | "warning" | "neutral" }> = {
  planning: { label: "Planejamento", variant: "neutral" },
  in_progress: { label: "Em andamento", variant: "info" },
  completed: { label: "Concluída", variant: "success" },
  paused: { label: "Pausada", variant: "warning" },
};

export default function PortalHomeScreen() {
  const projects = useQuery(api.portal.listMyProjects);
  const router = useRouter();

  if (projects === undefined) {
    return <LoadingState label="Carregando obras…" />;
  }

  if (projects.length === 0) {
    return (
      <View className="flex-1 justify-center px-5">
        <EmptyState
          icon={<Building2 size={28} color="#6366f1" />}
          title="Nenhuma obra disponível"
          description="Nenhuma obra disponível para o seu acesso."
        />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 12 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="mb-1">
        <Text className="text-2xl font-bold text-foreground">Minhas Obras</Text>
        <Text className="mt-1 text-sm text-muted-foreground">
          {projects.length} {projects.length === 1 ? "obra" : "obras"}
        </Text>
      </View>

      {projects.map((project) => {
        const cfg = statusConfig[project.status ?? ""] ?? statusConfig.planning;
        const prefix = project.legacyNumber ? `${project.legacyNumber} – ` : "";

        return (
          <Pressable
            key={project._id}
            onPress={() =>
              router.push({
                pathname: "/portal-projeto/[projectId]",
                params: { projectId: project._id },
              })
            }
          >
            <Card className="gap-3 p-4">
              <View className="flex-row items-start justify-between">
                <View className="min-w-0 flex-1 gap-1">
                  <Text className="font-semibold text-foreground" numberOfLines={2}>
                    {prefix}{project.name}
                  </Text>
                  {project.client ? (
                    <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                      {project.client}
                    </Text>
                  ) : null}
                </View>
                <View className="ml-3 flex-row items-center gap-2">
                  <Badge variant={cfg.variant}>{cfg.label}</Badge>
                  <ChevronRight size={16} color="#9ca3af" />
                </View>
              </View>

              <View className="gap-1.5">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs text-muted-foreground">
                    {project.installed}/{project.total} instalados
                  </Text>
                  <Text className="text-xs font-semibold text-foreground">
                    {project.pct}%
                  </Text>
                </View>
                <View className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <View
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${project.pct}%` }}
                  />
                </View>
              </View>
            </Card>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
