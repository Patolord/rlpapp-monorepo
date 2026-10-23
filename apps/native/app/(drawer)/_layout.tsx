import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useAuth } from "@clerk/expo";
import type { DrawerContentComponentProps } from "@react-navigation/drawer";
import { DrawerContentScrollView, DrawerItemList } from "@react-navigation/drawer";
import { Redirect, type Href } from "expo-router";
import { Drawer } from "expo-router/drawer";
import {
  Building2,
  Clock,
  HardHat,
  Home,
  Package,
  ShoppingCart,
  Users,
  Warehouse,
} from "lucide-react-native";
import React, { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LoadingScreen } from "@/components/auth/loading-screen";
import { RlpLogo } from "@/components/auth/rlp-logo";
import { SignOutButton } from "@/components/sign-out-button";
import { colors, radius, space, type } from "@/lib/theme";

const ITEM_STYLE = { borderRadius: radius.sm, marginHorizontal: space.md } as const;
const HIDDEN = { display: "none" } as const;

const ROLE_LABEL: Record<string, string> = {
  director: "Diretor",
  admin: "Administrador",
  manager: "Gerente",
  operator: "Operador",
  engenheiro: "Engenheiro",
  qr_operator: "Operador QR",
  client: "Cliente",
};

function DrawerLayout() {
  const { isLoaded, isSignedIn } = useAuth();

  const fg = colors.text;
  const bg = colors.bg;

  if (!isLoaded) {
    return <LoadingScreen />;
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
  const insets = useSafeAreaInsets();
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

  const userName = currentUser?.name ?? currentUser?.username ?? "";
  const roleLabel = currentUser?.role ? ROLE_LABEL[currentUser.role] ?? currentUser.role : "";

  const drawerContent = useCallback(
    (props: DrawerContentComponentProps) => (
      <View style={{ flex: 1, backgroundColor: bg }}>
        <View style={[styles.brand, { paddingTop: insets.top + space.lg }]}>
          <RlpLogo size={72} />
          {userName ? (
            <View style={styles.user}>
              <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                {userName}
              </Text>
              {roleLabel ? (
                <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                  {roleLabel}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
        <DrawerContentScrollView {...props} contentContainerStyle={{ paddingTop: space.sm }}>
          <DrawerItemList {...props} />
        </DrawerContentScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
          <SignOutButton />
        </View>
      </View>
    ),
    [bg, insets.top, insets.bottom, userName, roleLabel]
  );

  // Técnico de campo: o app dele começa (e fica) na lista de obras.
  if (currentUser?.role === "qr_operator") {
    return <Redirect href={"/campo" as Href} />;
  }

  return (
    <Drawer
      drawerContent={drawerContent}
      screenOptions={{
        headerShown: false,
        drawerStyle: { backgroundColor: bg },
        sceneStyle: { backgroundColor: bg },
        drawerActiveTintColor: colors.primary,
        drawerActiveBackgroundColor: colors.primarySoft,
        drawerInactiveTintColor: fg,
        drawerLabelStyle: { fontSize: 16, fontWeight: "500" },
        drawerItemStyle: ITEM_STYLE,
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
        name="ponto"
        options={{
          headerShown: true,
          headerTitle: "Marcação de ponto",
          headerShadowVisible: false,
          headerStyle: { backgroundColor: bg },
          headerTintColor: fg,
          drawerLabel: "Ponto",
          drawerIcon: ({ size, color }) => <Clock size={size} color={color} />,
        }}
      />
      <Drawer.Screen
        name="rh"
        options={{
          headerTitle: "Recursos Humanos",
          drawerLabel: "RH",
          drawerIcon: ({ size, color }) => <Users size={size} color={color} />,
          drawerItemStyle: showRh ? ITEM_STYLE : HIDDEN,
        }}
      />
      <Drawer.Screen
        name="engenharia"
        options={{
          headerTitle: "Engenharia",
          drawerLabel: "Engenharia",
          drawerIcon: ({ size, color }) => <HardHat size={size} color={color} />,
          drawerItemStyle: showEngenharia ? ITEM_STYLE : HIDDEN,
        }}
      />
      <Drawer.Screen
        name="compras"
        options={{
          headerTitle: "Compras",
          drawerLabel: "Compras",
          drawerIcon: ({ size, color }) => <ShoppingCart size={size} color={color} />,
          drawerItemStyle: showCompras ? ITEM_STYLE : HIDDEN,
        }}
      />
      <Drawer.Screen
        name="estoque"
        options={{
          headerTitle: "Estoque",
          drawerLabel: "Estoque",
          drawerIcon: ({ size, color }) => <Warehouse size={size} color={color} />,
          drawerItemStyle: showEstoque ? ITEM_STYLE : HIDDEN,
        }}
      />
      <Drawer.Screen
        name="portal"
        options={{
          headerTitle: "Portal",
          drawerLabel: "Portal",
          drawerIcon: ({ size, color }) => <Building2 size={size} color={color} />,
          drawerItemStyle: showPortal ? ITEM_STYLE : HIDDEN,
        }}
      />
    </Drawer>
  );
}

export default DrawerLayout;

const styles = StyleSheet.create({
  brand: {
    paddingHorizontal: space.xl,
    paddingBottom: space.lg,
    gap: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  user: {
    gap: 2,
  },
  footer: {
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
});
