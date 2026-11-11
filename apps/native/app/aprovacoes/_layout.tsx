import { Stack } from "expo-router";

import { useNativeHeaderOptions } from "@/lib/native-header";

export default function AprovacoesLayout() {
  const header = useNativeHeaderOptions();
  return (
    <Stack screenOptions={header}>
      <Stack.Screen name="index" options={{ title: "Aprovações de estoque" }} />
    </Stack>
  );
}
