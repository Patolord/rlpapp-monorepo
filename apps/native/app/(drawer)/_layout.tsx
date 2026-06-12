import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useAuth } from "@clerk/clerk-expo";
import type { DrawerContentComponentProps } from "@react-navigation/drawer";
import { DrawerContentScrollView, DrawerItemList } from "@react-navigation/drawer";
import { Redirect } from "expo-router";
import { Drawer } from "expo-router/drawer";
import {
  Home,
  Package,
  Tag,
  Users,
  MapPin,
  History,
  SlidersHorizontal,
  DollarSign,
  HardHat,
  Warehouse,
  ScanLine,
  ClipboardList,
  PackageCheck,
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

  // Áreas internas exigem login (mesma regra do web)
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
  const currentUser = useQuery(
    api.users.getCurrentUser,
    isSignedIn ? undefined : "skip"
  );
  const isDirector = currentUser?.role === "director";
  const userDept = currentUser?.department ?? "estoque";

  const showEstoque = isDirector || userDept === "estoque";
  const showFinanceiro = isDirector || userDept === "financeiro";
  const showRh = isDirector || userDept === "rh";
  const showEngenharia = isDirector || userDept === "engenharia";

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

  // qr_operator só interage com equipamentos via QR (fluxo web /q/$token)
  if (currentUser?.role === "qr_operator") {
    return (
      <View
        style={{ flex: 1, backgroundColor: bg }}
        className="items-center justify-center gap-4 px-8"
      >
        <Text
          style={{ color: fg }}
          className="text-center text-base font-medium"
        >
          Seu perfil acessa o sistema apenas pelos QR codes dos equipamentos.
        </Text>
        <SignOutButton />
      </View>
    );
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
        name="operador"
        options={{
          headerTitle: "Operador",
          drawerLabel: "Operador",
          drawerIcon: ({ size, color }) => <ScanLine size={size} color={color} />,
          drawerItemStyle: showEstoque ? undefined : { display: "none" },
        }}
      />
      <Drawer.Screen
        name="(tabs)"
        options={{
          headerTitle: "Estoque",
          drawerLabel: "Estoque",
          drawerIcon: ({ size, color }) => <Warehouse size={size} color={color} />,
          drawerItemStyle: showEstoque ? undefined : { display: "none" },
        }}
      />
      <Drawer.Screen
        name="produtos"
        options={{
          headerTitle: "Produtos",
          drawerLabel: "Produtos",
          drawerIcon: ({ size, color }) => <Tag size={size} color={color} />,
          drawerItemStyle: showEstoque ? undefined : { display: "none" },
        }}
      />
      <Drawer.Screen
        name="fornecedores"
        options={{
          headerTitle: "Fornecedores",
          drawerLabel: "Fornecedores",
          drawerIcon: ({ size, color }) => <Users size={size} color={color} />,
          drawerItemStyle: showEstoque ? undefined : { display: "none" },
        }}
      />
      <Drawer.Screen
        name="sites"
        options={{
          headerTitle: "Sites",
          drawerLabel: "Sites",
          drawerIcon: ({ size, color }) => <MapPin size={size} color={color} />,
          drawerItemStyle: showEstoque ? undefined : { display: "none" },
        }}
      />
      <Drawer.Screen
        name="movimentacoes"
        options={{
          headerTitle: "Movimentações",
          drawerLabel: "Movimentações",
          drawerIcon: ({ size, color }) => <History size={size} color={color} />,
          drawerItemStyle: showEstoque ? undefined : { display: "none" },
        }}
      />
      <Drawer.Screen
        name="solicitacoes"
        options={{
          headerTitle: "Solicitações",
          drawerLabel: "Solicitações",
          drawerIcon: ({ size, color }) => <ClipboardList size={size} color={color} />,
          drawerItemStyle: showEstoque ? undefined : { display: "none" },
        }}
      />
      <Drawer.Screen
        name="entregas"
        options={{
          headerTitle: "Entregas",
          drawerLabel: "Entregas",
          drawerIcon: ({ size, color }) => <PackageCheck size={size} color={color} />,
          drawerItemStyle: showEstoque ? undefined : { display: "none" },
        }}
      />
      <Drawer.Screen
        name="ajustes"
        options={{
          headerTitle: "Ajustes",
          drawerLabel: "Ajustes",
          drawerIcon: ({ size, color }) => <SlidersHorizontal size={size} color={color} />,
          drawerItemStyle: showEstoque ? undefined : { display: "none" },
        }}
      />
      <Drawer.Screen
        name="financeiro"
        options={{
          headerTitle: "Financeiro",
          drawerLabel: "Financeiro",
          drawerIcon: ({ size, color }) => <DollarSign size={size} color={color} />,
          drawerItemStyle: showFinanceiro ? undefined : { display: "none" },
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
    </Drawer>
  );
}

export default DrawerLayout;
