import "@/global.css";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { env } from "@rlpapp/env/native";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { ConvexReactClient, useConvexAuth, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { Stack } from "expo-router";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { AppThemeProvider, useAppTheme } from "@/contexts/app-theme-context";
import { OfflineSync } from "@/components/offline-sync";
import { COLORS } from "@/lib/colors";

export const unstable_settings = {
  initialRouteName: "(drawer)",
};

const convex = new ConvexReactClient(env.EXPO_PUBLIC_CONVEX_URL, {
  unsavedChangesWarning: false,
});

function EnsureUser() {
  const { isAuthenticated } = useConvexAuth();
  const ensureUser = useMutation(api.users.ensureUser);
  const called = useRef(false);

  useEffect(() => {
    if (isAuthenticated && !called.current) {
      called.current = true;
      ensureUser({}).catch(console.error);
    }
  }, [isAuthenticated, ensureUser]);

  return null;
}

function StackLayout() {
  const { isDark } = useAppTheme();
  const bg = isDark ? COLORS.dark.background : COLORS.light.background;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: bg },
      }}
    >
      <Stack.Screen name="(drawer)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="scanner" options={{ presentation: "fullScreenModal" }} />
      <Stack.Screen name="equipamento/[token]" options={{ headerShown: true }} />
      <Stack.Screen name="pendentes" options={{ headerShown: true }} />
      <Stack.Screen name="obra/[projectId]" options={{ headerShown: false }} />
      <Stack.Screen name="qr-operador" options={{ headerShown: true, title: "QR Operador" }} />
      <Stack.Screen name="meus-registros" options={{ headerShown: true, title: "Meus Registros" }} />
      <Stack.Screen name="portal-projeto/[projectId]" options={{ headerShown: true, title: "Projeto" }} />
    </Stack>
  );
}

export default function Layout() {
  return (
    <ClerkProvider tokenCache={tokenCache} publishableKey={env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaProvider>
            <KeyboardProvider>
              <AppThemeProvider>
                <InnerLayout />
              </AppThemeProvider>
            </KeyboardProvider>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}

function InnerLayout() {
  const { isDark } = useAppTheme();
  const bg = isDark ? COLORS.dark.background : COLORS.light.background;

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <EnsureUser />
      <OfflineSync />
      <StackLayout />
    </View>
  );
}
