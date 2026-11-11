import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { Tabs } from "expo-router";
import { useState } from "react";

import { AreaTabs } from "@/components/navigation/area-tabs";
import { useProfile } from "@/lib/profile";

// Compras: Painel · Materiais · Fornecedores · Preços · Revisão (B7).
export default function ComprasLayout() {
  const me = useProfile();
  // A engenharia lê Compras em consulta (decisão 44): sem Painel de revisão.
  const consult = me?.profile === "engenharia";
  const [now] = useState(() => Date.now());
  const stats = useQuery(api.priceEvents.dashboardStats, { now });
  const toReview = stats?.unreviewedPrices ?? 0;

  return (
    <AreaTabs title={consult ? "Materiais e preços" : "Compras"} subtitle={consult ? "Consulta" : undefined}>
      <Tabs.Screen name="index" options={{ title: "Painel" }} />
      <Tabs.Screen name="materiais" options={{ title: "Materiais" }} />
      <Tabs.Screen name="fornecedores" options={{ title: "Fornecedores" }} />
      <Tabs.Screen name="eventos-preco" options={{ title: "Preços" }} />
      <Tabs.Screen name="fila-revisao" options={{ title: "Revisão", href: consult ? null : undefined, tabBarBadge: toReview > 0 ? toReview : undefined }} />
    </AreaTabs>
  );
}
