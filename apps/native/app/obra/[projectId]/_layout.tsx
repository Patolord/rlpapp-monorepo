import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { Slot, useLocalSearchParams, useRouter, useSegments } from "expo-router";
import {
  ArrowLeft,
  Building2,
  Calculator,
  FileText,
  LayoutGrid,
  QrCode,
  Ruler,
  ShoppingCart,
  Warehouse,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { useRef } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconButton } from "@/components/ui";
import { colors, radius, space, type } from "@/lib/theme";

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
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const segments = useSegments();
  const scrollRef = useRef<ScrollView>(null);

  const bg = colors.bg;
  const chipBg = colors.surface;
  const chipActiveBg = colors.primary;
  const chipText = colors.textSecondary;
  const chipActiveText = colors.onPrimary;
  const iconColor = colors.icon;
  const iconActiveColor = colors.onPrimary;

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

  function goBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(drawer)");
  }

  return (
    <View style={{ flex: 1, backgroundColor: bg, paddingTop: insets.top }}>
      <View style={{ paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.screen, paddingTop: space.lg }}>
          <IconButton
            label="Voltar"
            onPress={goBack}
            icon={<ArrowLeft size={20} color={colors.text} strokeWidth={2} />}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.heading, { color: colors.text }]} numberOfLines={1}>
              {project?.name ?? "Obra"}
            </Text>
            {project?.customerName ? (
              <Text style={[type.bodySm, { color: colors.textSecondary }]} numberOfLines={1}>
                {project.customerName}
              </Text>
            ) : null}
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: space.screen, gap: space.sm, paddingTop: space.lg }}
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
                  height: 36,
                  paddingHorizontal: 14,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: active ? chipActiveBg : colors.border,
                  backgroundColor: active ? chipActiveBg : chipBg,
                }}
              >
                <Icon
                  size={15}
                  color={active ? iconActiveColor : iconColor}
                />
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
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
