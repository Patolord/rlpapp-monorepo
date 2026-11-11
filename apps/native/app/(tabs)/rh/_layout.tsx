import { Tabs } from "expo-router";

import { AreaTabs } from "@/components/navigation/area-tabs";

// RH: Funcionários · Folha · Ponto (B3).
export default function RhLayout() {
  return (
    <AreaTabs title="RH" subtitle="Equipe, folha e ponto">
      <Tabs.Screen name="index" options={{ title: "Funcionários" }} />
      <Tabs.Screen name="folha" options={{ title: "Folha" }} />
      <Tabs.Screen name="ponto" options={{ title: "Ponto" }} />
    </AreaTabs>
  );
}
