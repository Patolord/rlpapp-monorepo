import { Slot, useRouter } from "expo-router";
import { UserRound } from "lucide-react-native";

import { IconButton, Screen, ScreenHeader } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import { colors } from "@/lib/theme";

/** Portal do cliente (B8): sem barra de abas; o avatar abre a conta. */
export default function PortalLayout() {
  const router = useRouter();
  const me = useProfile();
  const isClient = me?.profile === "cliente";

  return (
    <Screen>
      <ScreenHeader
        title="Minhas obras"
        subtitle={isClient ? "Acompanhe o andamento das suas obras" : "Como o cliente vê as obras"}
        onBack={isClient ? undefined : () => router.back()}
        right={
          isClient ? (
            <IconButton label="Sua conta" onPress={() => router.push("/(tabs)/mais")} icon={<UserRound size={20} color={colors.text} />} />
          ) : undefined
        }
        large={isClient}
      />
      <Slot />
    </Screen>
  );
}
