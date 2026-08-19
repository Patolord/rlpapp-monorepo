import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { ArrowLeft, FileText, Plus } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";

import { ContractCard } from "@/components/engenharia/contract-card";
import { Button, ButtonText } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function ContratosScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const contracts = useQuery(api.contracts.list, {
    search: search || undefined,
  });

  return (
    <View className="flex-1">
      <View className="flex-row items-center gap-3 px-5 pb-4 pt-5">
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          className="h-9 w-9 items-center justify-center rounded-full bg-card"
        >
          <ArrowLeft size={20} color="#9ca3af" />
        </Pressable>
        <View className="flex-1">
          <Text className="text-2xl font-bold text-foreground">Contratos</Text>
          <Text className="text-sm text-muted-foreground">
            Gerencie todos os contratos
          </Text>
        </View>
      </View>

      <View className="px-5 pb-3">
        <Input
          placeholder="Buscar contratos..."
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {contracts === undefined ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={contracts}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 12 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Card className="items-center gap-3 py-10">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <FileText size={28} color="#f59e0b" />
              </View>
              <Text className="text-center text-base font-medium text-foreground">
                Nenhum contrato encontrado
              </Text>
              <Text className="px-6 text-center text-sm text-muted-foreground">
                {search
                  ? "Nenhum contrato corresponde à busca."
                  : "Os contratos aparecerão aqui quando forem criados."}
              </Text>
            </Card>
          }
          renderItem={({ item }) => (
            <ContractCard
              title={item.title}
              contractorName={item.contractorName}
              valueCents={item.valueCents}
              status="active"
              projectName={item.projectName}
            />
          )}
        />
      )}
    </View>
  );
}
