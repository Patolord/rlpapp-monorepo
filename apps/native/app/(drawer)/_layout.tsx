import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useAuth } from "@clerk/clerk-expo";
import type { DrawerContentComponentProps } from "@react-navigation/drawer";
import { DrawerContentScrollView, DrawerItemList } from "@react-navigation/drawer";
import { Redirect, useRouter } from "expo-router";
import { Drawer } from "expo-router/drawer";
import {
  Building2,
  HardHat,
  Home,
  Package,
  ShoppingCart,
  Users,
  Warehouse,
} from "lucide-react-native";
import React, { useCallback } from "react";
import { Text, View } from "react-native";

import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { useAppTheme } from "@/contexts/app-theme-context";
import { COLORS } from "@/lib/colors";

function DrawerLayout() {
  const { isDark } = useAppTheme();
  const { isLoaded, isSignedIn } = useAuth();

  const fg = isDark ? COLORS.dark.foreground : COLORS.light.foreground;
  const bg = isDark ? COLORS.dark.background : COLORS.light.background;

  if (!isLoaded) {
    return <View style={{ flex: 1, backgroundColor: bg }} />;
  }

  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return <RoleAwareDrawer fg={fg} bg={bg} isSignedIn={!!isSignedIn} />;
}

function RoleAwareDrawer({
  fg,
  bg,
  isSignedIn,
}: {
  fg: string;
  bg: string;
  isSignedIn: boolean;
}) {
  const router = useRouter();
  const currentUser = useQuery(
    api.users.getCurrentUser,
    isSignedIn ? undefined : "skip"
  );
  const isDirector = currentUser?.role === "director";
  const isEngenheiro = currentUser?.role === "engenheiro";
  const userDept = currentUser?.department ?? "engenharia";

  const showRh = isDirector || (!isEngenheiro && userDept === "rh");
  const showEngenharia = isDirector || isEngenheiro || userDept === "engenharia";
  const showCompras = isDirector || userDept === "compras";
  const showEstoque = isDirector || userDept === "estoque" || userDept === "compras" || isEngenheiro;
  const showPortal = isDirector || currentUser?.role === "client";

  const drawerContent = useCallback(
    (props: DrawerContentComponentProps) => (
      <DrawerContentScrollView {...props} style={{ backgroundColor: bg }}>
        <DrawerItemList {...props} />
        <View className="flex-row items-center justify-end border-t border-border/30 px-4 py-3">
          <ThemeToggle />
        </View>
      </DrawerContentScrollView>
    ),
    [bg]
  );

  if (currentUser?.role === "qr_operator") {
    return <Redirect href="/qr-operador" />;
  }

  return (
    <Drawer
      drawerContent={drawerContent}
      screenOptions={{
        headerShown: false,
        drawerStyle: { backgroundColor: bg },
        sceneStyle: { backgroundColor: bg },
        drawerActiveTintColor: "#3b82f6",
        drawerInactiveTintColor: fg,
      }}
    >
      <Drawer.Screen
        name="index"
        options={{
          headerTitle: isDirector ? "Painel do Diretor" : "Home",
          drawerLabel: isDirector ? "Início" : "Home",
          drawerIcon: ({ size, color }) => <Home size={size} color={color} />,
        }}
      />
      <Drawer.Screen
        name="rh"
        options={{
          headerTitle: "Recursos Humanos",
          drawerLabel: "RH",
          drawerIcon: ({ size, color }) => <Users size={size} color={color} />,
          drawerItemStyle: showRh ? undefined : { display: "none" },
        }}
      />
      <Drawer.Screen
        name="engenharia"
        options={{
          headerTitle: "Engenharia",
          drawerLabel: "Engenharia",
          drawerIcon: ({ size, color }) => <HardHat size={size} color={color} />,
          drawerItemStyle: showEngenharia ? undefined : { display: "none" },
        }}
      />
      <Drawer.Screen
        name="compras"
        options={{
          headerTitle: "Compras",
          drawerLabel: "Compras",
          drawerIcon: ({ size, color }) => <ShoppingCart size={size} color={color} />,
          drawerItemStyle: showCompras ? undefined : { display: "none" },
        }}
      />
      <Drawer.Screen
        name="estoque"
        options={{
          headerTitle: "Estoque",
          drawerLabel: "Estoque",
          drawerIcon: ({ size, color }) => <Warehouse size={size} color={color} />,
          drawerItemStyle: showEstoque ? undefined : { display: "none" },
        }}
      />
      <Drawer.Screen
        name="portal"
        options={{
          headerTitle: "Portal",
          drawerLabel: "Portal",
          drawerIcon: ({ size, color }) => <Building2 size={size} color={color} />,
          drawerItemStyle: showPortal ? undefined : { display: "none" },
        }}
      />
    </Drawer>
  );
}

export default DrawerLayout;
