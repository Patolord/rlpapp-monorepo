import { useAuth } from "@clerk/expo";
import { Redirect, Tabs } from "expo-router";
import {
  Building2,
  ClipboardList,
  Clock,
  Home,
  LayoutGrid,
  MoreHorizontal,
  ShoppingCart,
  Users,
  Warehouse,
} from "lucide-react-native";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LoadingScreen } from "@/components/auth/loading-screen";
import { PROFILE_TABS, useProfile, type MainTab } from "@/lib/profile";
import { colors } from "@/lib/theme";

// ---------------------------------------------------------------------------
// Barra de abas por perfil (claude/rlpapp-native-navegacao.md §1 e §3).
// Todas as abas possíveis estão aqui; cada perfil esconde as que não são dele
// com href: null. O técnico vai para app/campo; o cliente não tem barra.
// ---------------------------------------------------------------------------
type TabDef = { title: string; icon: (color: string) => React.ReactNode };

const TAB_DEFS: Record<MainTab, TabDef> = {
  index: { title: "Início", icon: (c) => <Home size={24} color={c} /> },
  obras: { title: "Obras", icon: (c) => <Building2 size={24} color={c} /> },
  engenharia: { title: "Engenharia", icon: (c) => <ClipboardList size={24} color={c} /> },
  compras: { title: "Compras", icon: (c) => <ShoppingCart size={24} color={c} /> },
  estoque: { title: "Estoque", icon: (c) => <Warehouse size={24} color={c} /> },
  rh: { title: "RH", icon: (c) => <Users size={24} color={c} /> },
  areas: { title: "Áreas", icon: (c) => <LayoutGrid size={24} color={c} /> },
  ponto: { title: "Ponto", icon: (c) => <Clock size={24} color={c} /> },
  mais: { title: "Mais", icon: (c) => <MoreHorizontal size={24} color={c} /> },
};

const ORDER: MainTab[] = ["index", "obras", "engenharia", "compras", "estoque", "rh", "areas", "ponto", "mais"];

export default function TabsLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const me = useProfile();
  const insets = useSafeAreaInsets();

  if (!isLoaded) return <LoadingScreen />;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;
  if (me === undefined || me === null) return <LoadingScreen />;
  if (me.profile === "tecnico") return <Redirect href="/campo" />;

  const isClient = me.profile === "cliente";
  const pontoHeader = {
    headerShown: true,
    headerShadowVisible: false,
    headerStyle: { backgroundColor: colors.bg },
    headerTitleStyle: { color: colors.text, fontSize: 18, fontWeight: "600" as const },
    headerTitleAlign: "left" as const,
  };
  const visible = new Set<MainTab>(isClient ? [] : PROFILE_TABS[me.profile]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontSize: 12, lineHeight: 16, fontWeight: "600" },
        tabBarStyle: isClient
          ? { display: "none" }
          : {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              borderTopWidth: 1,
              height: 56 + insets.bottom,
              paddingTop: 6,
              paddingBottom: insets.bottom > 0 ? insets.bottom : 6,
            },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {ORDER.map((name) => {
        const def = TAB_DEFS[name];
        return (
          <Tabs.Screen
            key={name}
            name={name}
            options={{
              title: def.title,
              href: visible.has(name) ? undefined : null,
              tabBarIcon: ({ color }) => def.icon(color),
              ...(name === "ponto" ? pontoHeader : null),
            }}
          />
        );
      })}
      <Tabs.Screen name="portal" options={{ href: null, title: "Minhas obras" }} />
    </Tabs>
  );
}
