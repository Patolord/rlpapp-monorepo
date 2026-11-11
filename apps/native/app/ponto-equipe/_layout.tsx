import { Stack } from "expo-router";

import { useNativeHeaderOptions } from "@/lib/native-header";

/** Ponto da equipe (RH): regras da marcação, quem bate ponto e cercas das obras. */
export default function PontoEquipeLayout() {
  const header = useNativeHeaderOptions();
  return (
    <Stack screenOptions={header}>
      <Stack.Screen name="configurar" options={{ title: "Configurar ponto" }} />
      <Stack.Screen name="pessoas" options={{ title: "Quem bate ponto" }} />
      <Stack.Screen name="cercas" options={{ title: "Cercas das obras" }} />
    </Stack>
  );
}
