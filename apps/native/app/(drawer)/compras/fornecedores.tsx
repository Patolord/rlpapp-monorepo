import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { Plus, Search, Truck } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";

import { SupplierCard } from "@/components/compras/supplier-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function FornecedoresScreen() {
  const [search, setSearch] = useState("");
  const suppliers = useQuery(api.suppliers.list, {
    search: search || undefined,
    activeOnly: true,
  });

  return (
    <View className="flex-1">
      <View className="gap-3 px-5 pb-3 pt-5">
        <View className="flex-row items-center gap-2">
          <View className="relative min-w-0 flex-1">
            <View className="absolute left-3 top-0 z-10 h-10 justify-center">
              <Search size={16} color="#9ca3af" />
            </View>
            <Input
              className="pl-9"
              placeholder="Buscar fornecedor..."
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>
      </View>

      {suppliers === undefined ? (
        <View className="flex-1 items-center justify-center py-16">
          <ActivityIndicator size="large" />
        </View>
      ) : suppliers.length === 0 ? (
        <View className="flex-1 px-5">
          <Card className="items-center gap-3 py-10">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
              <Truck size={28} color="#10b981" />
            </View>
            <Text className="text-center text-base font-medium text-foreground">
              {search
                ? "Nenhum fornecedor encontrado"
                : "Nenhum fornecedor cadastrado"}
            </Text>
            <Text className="px-6 text-center text-sm text-muted-foreground">
              {search
                ? "Tente buscar com outro termo."
                : "Cadastre o primeiro fornecedor para começar."}
            </Text>
          </Card>
        </View>
      ) : (
        <FlatList
          data={suppliers}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 80, gap: 8 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <SupplierCard
              name={item.name}
              categories={item.categories}
              notes={item.notes}
              active={item.active}
            />
          )}
        />
      )}

      <View className="absolute bottom-6 right-6">
        <Button className="h-14 w-14 rounded-full shadow-lg" size="icon">
          <Plus size={24} color="#fafafa" />
        </Button>
      </View>
    </View>
  );
}
