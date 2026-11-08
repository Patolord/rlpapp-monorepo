import { Stack } from "expo-router";

import { useNativeHeaderOptions } from "@/lib/native-header";

/** Ponto da equipe (RH): sincronizar, configurar, pessoas e cercas do RHID. */
export default function PontoEquipeLayout() {
  const header = useNativeHeaderOptions();
  return (
    <Stack screenOptions={header}>
      <Stack.Screen name="sincronizar" options={{ title: "Sincronizar RHID" }} />
      <Stack.Screen name="configurar" options={{ title: "Configurar ponto" }} />
      <Stack.Screen name="pessoas" options={{ title: "Pessoas do RHID" }} />
      <Stack.Screen name="cercas" options={{ title: "Cercas do RHID" }} />
    </Stack>
  );
}
