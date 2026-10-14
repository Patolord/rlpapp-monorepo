import { useAuth } from "@clerk/expo";
import { Redirect, Stack } from "expo-router";
import { View } from "react-native";

import { useAppTheme } from "@/contexts/app-theme-context";
import { COLORS } from "@/lib/colors";
import { useNativeHeaderOptions } from "@/lib/native-header";

/**
 * App de campo (técnico / QR operador). Tudo acontece dentro de uma obra:
 * lista de obras → obra → escanear/digitar etiqueta → equipamento.
 */
export default function CampoLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const { isDark } = useAppTheme();
  const header = useNativeHeaderOptions();
  const bg = isDark ? COLORS.dark.background : COLORS.light.background;

  if (!isLoaded) {
    return <View style={{ flex: 1, backgroundColor: bg }} />;
  }

  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <Stack screenOptions={{ ...header, headerBackButtonDisplayMode: "minimal" }}>
      <Stack.Screen name="index" options={{ title: "Minhas obras" }} />
      <Stack.Screen name="outras-obras" options={{ title: "Outras obras" }} />
      <Stack.Screen name="pendentes" options={{ title: "Registros pendentes" }} />
      <Stack.Screen name="obra/[projectId]/index" options={{ title: "Obra" }} />
      <Stack.Screen
        name="obra/[projectId]/scanner"
        options={{ headerShown: false, presentation: "fullScreenModal" }}
      />
      <Stack.Screen name="obra/[projectId]/etiquetas" options={{ title: "Etiquetas QR" }} />
      <Stack.Screen name="obra/[projectId]/registros" options={{ title: "Meus registros" }} />
      <Stack.Screen
        name="obra/[projectId]/equipamento/[token]"
        options={{ title: "Equipamento" }}
      />
    </Stack>
  );
}
