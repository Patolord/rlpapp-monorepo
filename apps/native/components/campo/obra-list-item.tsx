import { Building2, ChevronRight, QrCode } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { Badge } from "@rlpapp/ui/native";
import { Card } from "@/components/ui/card";
import { OBRA_STATUS_LABELS, obraSubtitle, obraTitle } from "./obra";

interface ObraListItemProps {
  project: {
    name: string;
    legacyNumber: number | null;
    client: string | null;
    address: string | null;
    status: string | null;
    qrCount: number;
    registeredCount: number;
  };
  onPress: () => void;
}

/** Linha de obra usada em "Minhas obras" e na busca por outras obras. */
export function ObraListItem({ project, onPress }: ObraListItemProps) {
  const subtitle = obraSubtitle(project);
  const statusLabel = project.status
    ? (OBRA_STATUS_LABELS[project.status] ?? project.status)
    : null;

  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card className="flex-row items-center gap-3 p-4">
        <View className="h-11 w-11 items-center justify-center rounded-xl bg-amber-100">
          <Building2 size={22} color="#d97706" />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
            {obraTitle(project)}
          </Text>
          {subtitle ? (
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
          <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
            {statusLabel ? <Badge variant="neutral">{statusLabel}</Badge> : null}
            <View className="flex-row items-center gap-1">
              <QrCode size={12} color="#9ca3af" />
              <Text className="text-xs text-muted-foreground">
                {project.registeredCount}/{project.qrCount} etiquetas cadastradas
              </Text>
            </View>
          </View>
        </View>
        <ChevronRight size={18} color="#9ca3af" />
      </Card>
    </Pressable>
  );
}
