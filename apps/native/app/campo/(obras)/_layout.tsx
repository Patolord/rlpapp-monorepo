import { Stack } from "expo-router";

import { useNativeHeaderOptions } from "@/lib/native-header";

/**
 * Aba Obras do técnico: lista de obras → obra → escanear/digitar etiqueta →
 * equipamento. Tudo empilhado aqui, com a barra de abas visível (A3 §6).
 */
export default function CampoObrasLayout() {
  const header = useNativeHeaderOptions();
  return (
    <Stack screenOptions={header}>
      <Stack.Screen name="index" options={{ title: "Minhas obras" }} />
      <Stack.Screen name="outras-obras" options={{ title: "Outras obras" }} />
      <Stack.Screen name="meus-registros" options={{ title: "Meus registros" }} />
      <Stack.Screen name="obra/[projectId]/index" options={{ title: "Obra" }} />
      <Stack.Screen name="obra/[projectId]/scanner" options={{ headerShown: false, presentation: "fullScreenModal" }} />
      <Stack.Screen name="obra/[projectId]/etiquetas" options={{ title: "Equipamentos" }} />
      <Stack.Screen name="obra/[projectId]/documentos" options={{ title: "Documentos" }} />
      <Stack.Screen name="obra/[projectId]/estoque" options={{ title: "Estoque" }} />
      <Stack.Screen name="obra/[projectId]/registros" options={{ title: "Meus registros" }} />
      <Stack.Screen name="obra/[projectId]/equipamento/[token]" options={{ title: "Equipamento" }} />
    </Stack>
  );
}
