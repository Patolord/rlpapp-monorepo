import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from "@expo-google-fonts/inter";
import { env } from "@rlpapp/env/native";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { ConvexReactClient, useConvexAuth, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { OfflineSync } from "@/components/offline-sync";
import { PushRegistration } from "@/components/push-registration";
import { ToastProvider } from "@/components/ui";
import { colors } from "@/lib/theme";

void SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: "(tabs)",
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
    if (!isAuthenticated) called.current = false;
  }, [isAuthenticated, ensureUser]);

  return null;
}

function StackLayout() {
  const bg = colors.bg;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: bg },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
      {/* App de campo (técnico): tudo dentro de uma obra. */}
      <Stack.Screen name="campo" />
      <Stack.Screen name="scanner" options={{ presentation: "fullScreenModal" }} />
      <Stack.Screen name="equipamento/[token]" options={{ headerShown: true }} />
      <Stack.Screen name="pendentes" options={{ headerShown: true }} />
      <Stack.Screen name="notificacoes" />
      <Stack.Screen name="minhas-marcacoes" />
      <Stack.Screen name="ponto-equipe" />
      <Stack.Screen name="funcionario/[employeeId]" />
      <Stack.Screen name="aprovacoes" />
      <Stack.Screen name="takeoff/[takeoffId]" />
      <Stack.Screen name="equipamento-eng/[id]" />
      <Stack.Screen name="lote/[batchId]" />
      <Stack.Screen name="obra/[projectId]" options={{ headerShown: false }} />
      <Stack.Screen name="portal-projeto/[projectId]" />
    </Stack>
  );
}

export default function Layout() {
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  useEffect(() => {
    if (loaded) void SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <ClerkProvider tokenCache={tokenCache} publishableKey={env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaProvider>
            <KeyboardProvider>
              <ToastProvider>
                <InnerLayout />
              </ToastProvider>
            </KeyboardProvider>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}

function InnerLayout() {
  const bg = colors.bg;

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <EnsureUser />
      <PushRegistration />
      <OfflineSync />
      <StackLayout />
    </View>
  );
}
