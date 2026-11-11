import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { Slot, useLocalSearchParams, useRouter, useSegments, type Href } from "expo-router";
import {
  ArrowLeft,
  Bot,
  Building2,
  Calculator,
  FileText,
  FolderOpen,
  LayoutGrid,
  QrCode,
  Ruler,
  Warehouse,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconButton } from "@/components/ui";
import { useProfile, type Profile } from "@/lib/profile";
import { colors, radius, space, type } from "@/lib/theme";

type Segment = "index" | "predio" | "orcamento" | "contratos" | "medicoes" | "estoque" | "documentos" | "qr-codes" | "assistente";

const TABS: Record<Segment, { label: string; icon: LucideIcon }> = {
  index: { label: "Visão geral", icon: LayoutGrid },
  predio: { label: "Prédio", icon: Building2 },
  orcamento: { label: "Orçamento", icon: Calculator },
  contratos: { label: "Contratos", icon: FileText },
  medicoes: { label: "Medições", icon: Ruler },
  estoque: { label: "Estoque", icon: Warehouse },
  documentos: { label: "Documentos", icon: FolderOpen },
  "qr-codes": { label: "QR e serviços", icon: QrCode },
  assistente: { label: "Assistente", icon: Bot },
};

/** Abas da obra por perfil (A3 §2): só o que o servidor deixa cada um ler. */
function tabsFor(profile: Profile | undefined): Segment[] {
  if (profile === "compras") return ["orcamento", "estoque"];
  if (profile === "estoque") return ["estoque"];
  return ["index", "predio", "orcamento", "contratos", "medicoes", "estoque", "documentos", "qr-codes", "assistente"];
}

function resolveActiveSegment(segments: string[]): Segment {
  const last = segments[segments.length - 1];
  if (!last || last.startsWith("[")) return "index";
  return (last in TABS ? last : "index") as Segment;
}

const LAST_TAB_KEY = "rlp-obra-tab:";

export default function ProjectTabsLayout() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const segments = useSegments();
  const me = useProfile();
  const restored = useRef(false);

  const profile = me?.profile;
  const engineering = profile === "engenharia" || profile === "diretoria";
  const tabs = tabsFor(profile);
  const active = resolveActiveSegment(segments);

  const overview = useQuery(api.projects.getOverview, engineering ? { projectId: projectId as Id<"projects"> } : "skip");
  const options = useQuery(api.inventory.listProjects, me && !engineering ? {} : "skip");
  const name = engineering ? overview?.name : options?.find((p) => p._id === projectId)?.name;
  const subtitle = engineering ? overview?.customerName : null;

  function navigate(segment: Segment, remember = true) {
    const target = segment === "index" ? `/obra/${projectId}` : `/obra/${projectId}/${segment}`;
    router.replace(target as Href);
    if (remember) void AsyncStorage.setItem(LAST_TAB_KEY + projectId, segment).catch(() => undefined);
  }

  // Perfil que não lê a aba aberta vai para a primeira que ele lê; ao abrir a
  // obra pela visão geral, volta para a última aba usada nesta obra.
  useEffect(() => {
    if (!me) return;
    if (!tabs.includes(active)) {
      navigate(tabs[0]!, false);
      return;
    }
    if (restored.current || active !== "index") {
      restored.current = true;
      return;
    }
    restored.current = true;
    void AsyncStorage.getItem(LAST_TAB_KEY + projectId).then((saved) => {
      if (saved && saved !== "index" && tabs.includes(saved as Segment)) navigate(saved as Segment, false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, active, projectId]);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.top}>
        <View style={styles.titleRow}>
          <IconButton label="Voltar" onPress={goBack} icon={<ArrowLeft size={20} color={colors.text} strokeWidth={2} />} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.heading, { color: colors.text }]} numberOfLines={1}>
              {name ?? "Obra"}
            </Text>
            {subtitle ? (
              <Text style={[type.bodySm, { color: colors.textSecondaryOnBg }]} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>

        {tabs.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
            {tabs.map((segment) => {
              const tab = TABS[segment];
              const isActive = active === segment;
              const Icon = tab.icon;
              return (
                <Pressable
                  key={segment}
                  onPress={() => navigate(segment)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  style={[styles.chip, isActive && styles.chipActive]}
                >
                  <Icon size={15} color={isActive ? colors.onPrimary : colors.icon} />
                  <Text style={[styles.chipText, isActive && { color: colors.onPrimary }]}>{tab.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </View>
      <Slot />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.screen, paddingTop: space.lg },
  strip: { paddingHorizontal: space.screen, gap: space.sm, paddingTop: space.lg },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    backgroundColor: colors.surface,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  chipText: { fontSize: 14, fontWeight: "600", color: colors.textSecondary },
});
