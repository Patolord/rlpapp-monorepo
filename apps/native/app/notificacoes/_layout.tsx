import { Stack } from "expo-router";

import { useNativeHeaderOptions } from "@/lib/native-header";

/** Central de notificações (S13), preferências (S14) e item indisponível (S16). */
export default function NotificacoesLayout() {
  const header = useNativeHeaderOptions();
  return (
    <Stack screenOptions={header}>
      <Stack.Screen name="index" options={{ title: "Notificações" }} />
      <Stack.Screen name="preferencias" options={{ title: "Notificações" }} />
      <Stack.Screen name="indisponivel" options={{ title: "" }} />
    </Stack>
  );
}
