import { useAuth } from "@clerk/expo";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { Tabs } from "expo-router";

import { AreaTabs } from "@/components/navigation/area-tabs";
import { useCachedQuery } from "@/lib/use-cached-query";

// Estoque: Central · Movimentações · Pedidos (B4) · Cadastro (em campo, para
// quem tem `estoque.cadastro`). As aprovações de exceção são do engenheiro
// responsável e abrem pelo Início dele (decisão 40).
export default function EstoqueLayout() {
  const { userId } = useAuth();
  const approved = useQuery(api.inventoryRequests.listOfficeRequests, { status: "approved" });
  const toFulfill = approved?.length ?? 0;
  const { data: access } = useCachedQuery(userId ? `inventory-access:${userId}` : null, api.inventory.getAccess, {});

  return (
    <AreaTabs title="Estoque">
      <Tabs.Screen name="index" options={{ title: "Central" }} />
      <Tabs.Screen name="movimentacoes" options={{ title: "Movimentações" }} />
      <Tabs.Screen name="requisicoes" options={{ title: "Pedidos", tabBarBadge: toFulfill > 0 ? toFulfill : undefined }} />
      <Tabs.Screen name="cadastro" options={{ title: "Cadastro", href: access?.canCapture ? undefined : null }} />
    </AreaTabs>
  );
}
