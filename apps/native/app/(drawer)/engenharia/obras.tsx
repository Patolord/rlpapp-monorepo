import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { Building2, ChevronRight, Layers, Plus } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { Button, ButtonText } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProjectFormDialog } from "@/components/engenharia/project-form-dialog";

type ProjectSummary = {
  _id: Id<"projects">;
  name: string;
  floors: { number: number; label: string }[];
  createdAt: number;
  totalItems: number;
  installedItems: number;
  unitCount: number;
};

export default function ObrasScreen() {
  const projects = useQuery(api.projects.list);
  const [creating, setCreating] = useState(false);

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 20 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-row items-end justify-between gap-3">
        <View className="flex-1">
          <Text className="text-2xl font-bold text-foreground">Obras</Text>
          <Text className="mt-1 text-muted-foreground">
            Acompanhe o avanço das instalações prédio por prédio.
          </Text>
        </View>
        <Button size="sm" onPress={() => setCreating(true)}>
          <Plus size={16} color="#fafafa" />
          <ButtonText className="ml-1.5">Nova</ButtonText>
        </Button>
      </View>

      {projects === undefined ? (
        <View className="items-center justify-center py-16">
          <ActivityIndicator size="large" />
        </View>
      ) : projects.length === 0 ? (
        <EmptyState onCreate={() => setCreating(true)} />
      ) : (
        <View className="gap-3">
          {projects.map((project) => (
            <ProjectCard key={project._id} project={project} />
          ))}
        </View>
      )}

      <ProjectFormDialog open={creating} onClose={() => setCreating(false)} />
    </ScrollView>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="items-center gap-4 py-14">
      <View className="h-14 w-14 items-center justify-center rounded-full bg-primary/10">
        <Building2 size={28} color="#1a1a2e" />
      </View>
      <View className="gap-1">
        <Text className="text-center text-lg font-semibold text-foreground">
          Nenhuma obra cadastrada
        </Text>
        <Text className="max-w-xs text-center text-sm text-muted-foreground">
          Crie a primeira obra para montar o prédio e acompanhar o que já foi
          instalado em cada andar.
        </Text>
      </View>
      <Button onPress={onCreate}>
        <Plus size={16} color="#fafafa" />
        <ButtonText className="ml-1.5">Criar primeira obra</ButtonText>
      </Button>
    </Card>
  );
}

function ProjectCard({ project }: { project: ProjectSummary }) {
  const router = useRouter();
  const pct =
    project.totalItems === 0
      ? 0
      : Math.round((project.installedItems / project.totalItems) * 100);
  const date = new Date(project.createdAt).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/obra/[projectId]",
          params: { projectId: project._id },
        })
      }
    >
      <Card className="gap-4 p-4">
        <View className="flex-row items-start justify-between gap-2">
          <View className="min-w-0 flex-1 gap-1">
            <Text
              className="text-lg font-semibold text-foreground"
              numberOfLines={1}
            >
              {project.name}
            </Text>
            <View className="flex-row items-center gap-1.5">
              <Layers size={13} color="#9ca3af" />
              <Text className="text-sm text-muted-foreground">
                {project.floors.length} andar
                {project.floors.length === 1 ? "" : "es"} · {project.unitCount}{" "}
                apto{project.unitCount === 1 ? "" : "s"} · {date}
              </Text>
            </View>
          </View>
          <ChevronRight size={20} color="#9ca3af" />
        </View>

        <View className="gap-2">
          <View className="flex-row items-baseline justify-between">
            <Text className="text-sm text-muted-foreground">Instalados</Text>
            <Text className="text-sm font-semibold text-foreground">
              {project.installedItems}/{project.totalItems}
            </Text>
          </View>
          <View className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <View
              className="h-full rounded-full bg-primary"
              style={{ width: `${pct}%` }}
            />
          </View>
          <Text className="text-right text-xs text-muted-foreground">
            {pct}% concluído
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}
