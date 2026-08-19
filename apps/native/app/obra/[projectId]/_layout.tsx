import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { Slot, useLocalSearchParams, useRouter, useSegments } from "expo-router";
import {
  Building2,
  Calculator,
  FileText,
  LayoutGrid,
  QrCode,
  Ruler,
  ShoppingCart,
  Warehouse,
  Wind,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { useRef } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useAppTheme } from "@/contexts/app-theme-context";
import { COLORS } from "@/lib/colors";

interface TabDef {
  segment: string;
  label: string;
  icon: LucideIcon;
}

const TABS: TabDef[] = [
  { segment: "index", label: "Hub", icon: LayoutGrid },
  { segment: "predio", label: "Prédio", icon: Building2 },
  { segment: "orcamento", label: "Orçamento", icon: Calculator },
  { segment: "medicoes", label: "Medições", icon: Ruler },
  { segment: "compras", label: "Compras", icon: ShoppingCart },
  { segment: "estoque", label: "Estoque", icon: Warehouse },
  { segment: "dutos", label: "Dutos", icon: Wind },
  { segment: "contratos", label: "Contratos", icon: FileText },
  { segment: "qr-codes", label: "QR Codes", icon: QrCode },
];

function resolveActiveSegment(segments: string[]): string {
  const last = segments[segments.length - 1];
  if (!last || last.startsWith("[")) return "index";
  return last;
}

export default function ProjectTabsLayout() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { isDark } = useAppTheme();
  const router = useRouter();
  const segments = useSegments();
  const scrollRef = useRef<ScrollView>(null);

  const bg = isDark ? COLORS.dark.background : COLORS.light.background;
  const chipBg = isDark ? "#1e293b" : "#e2e8f0";
  const chipActiveBg = isDark ? "#f59e0b" : "#f59e0b";
  const chipText = isDark ? "#94a3b8" : "#64748b";
  const chipActiveText = "#000";
  const iconColor = chipText;
  const iconActiveColor = chipActiveText;

  const activeSegment = resolveActiveSegment(segments);

  const project = useQuery(api.projects.getOverview, {
    projectId: projectId as Id<"projects">,
  });

  function navigate(segment: string) {
    const target = segment === "index" ? "" : segment;
    router.replace({
      pathname: `/obra/[projectId]/${target}` as const,
      params: { projectId: projectId! },
    } as any);
  }

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <View className="border-b border-border/40 bg-card/80 pb-2 pt-3">
        <Text
          className="px-5 text-lg font-bold text-foreground"
          numberOfLines={1}
        >
          {project?.name ?? "Obra"}
        </Text>

        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingTop: 10 }}
        >
          {TABS.map((tab) => {
            const active = activeSegment === tab.segment;
            const Icon = tab.icon;
            return (
              <Pressable
                key={tab.segment}
                onPress={() => navigate(tab.segment)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 20,
                  backgroundColor: active ? chipActiveBg : chipBg,
                }}
              >
                <Icon
                  size={15}
                  color={active ? iconActiveColor : iconColor}
                />
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: active ? "700" : "500",
                    color: active ? chipActiveText : chipText,
                  }}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <Slot />
    </View>
  );
}
