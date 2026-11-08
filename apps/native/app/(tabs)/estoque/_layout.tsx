import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { Tabs } from "expo-router";

import { AreaTabs } from "@/components/navigation/area-tabs";

// Estoque: Central · Movimentações · Pedidos (B4). As aprovações de exceção
// são do engenheiro responsável e abrem pelo Início dele (decisão 40).
export default function EstoqueLayout() {
  const approved = useQuery(api.inventoryRequests.listOfficeRequests, { status: "approved" });
  const toFulfill = approved?.length ?? 0;

  return (
    <AreaTabs title="Estoque">
      <Tabs.Screen name="index" options={{ title: "Central" }} />
      <Tabs.Screen name="movimentacoes" options={{ title: "Movimentações" }} />
      <Tabs.Screen name="requisicoes" options={{ title: "Pedidos", tabBarBadge: toFulfill > 0 ? toFulfill : undefined }} />
      <Tabs.Screen name="aprovacoes" options={{ title: "Aprovações", href: null }} />
    </AreaTabs>
  );
}
