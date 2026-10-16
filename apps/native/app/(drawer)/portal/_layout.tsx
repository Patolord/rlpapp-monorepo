import { Slot, useNavigation } from "expo-router";

import { Screen, ScreenHeader } from "@/components/ui";

export default function PortalLayout() {
  const navigation = useNavigation<{ openDrawer: () => void }>();

  return (
    <Screen>
      <ScreenHeader
        title="Portal do Cliente"
        subtitle="Acompanhe suas obras"
        onMenu={() => navigation.openDrawer()}
        large
      />
      <Slot />
    </Screen>
  );
}
