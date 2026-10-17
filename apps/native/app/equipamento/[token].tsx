import { Stack, useLocalSearchParams } from "expo-router";

import { EquipmentTokenView } from "@/components/campo/equipment-token-view";

export default function EquipmentTokenScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const tokenStr = Array.isArray(token) ? token[0] : token;

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Equipamento" }} />
      <EquipmentTokenView token={tokenStr ?? ""} />
    </>
  );
}
