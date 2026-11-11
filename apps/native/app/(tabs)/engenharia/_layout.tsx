import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useNativeHeaderOptions } from "@/lib/native-header";
import { colors } from "@/lib/theme";

// Engenharia: um menu (B6) que leva às telas da área, empilhadas. A linha
// "Obras" saiu porque Obras já é uma aba (decisão 45).
export default function EngenhariaLayout() {
  const insets = useSafeAreaInsets();
  const header = useNativeHeaderOptions();
  const own = { contentStyle: { backgroundColor: colors.bg, paddingTop: insets.top } };

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="index" options={own} />
      <Stack.Screen name="medicoes" options={own} />
      <Stack.Screen name="contratos" options={own} />
      <Stack.Screen name="clientes" options={own} />
      <Stack.Screen name="empreiteiros" options={own} />
      <Stack.Screen name="equipamentos" options={{ ...header, title: "Equipamentos" }} />
      <Stack.Screen name="qr-codes" options={{ ...header, title: "Etiquetas QR" }} />
      <Stack.Screen name="registro" options={{ ...header, title: "Meus registros" }} />
      <Stack.Screen name="usuarios" options={{ ...header, title: "Usuários" }} />
    </Stack>
  );
}
