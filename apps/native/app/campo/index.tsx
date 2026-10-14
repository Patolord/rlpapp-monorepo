import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { Stack, useRouter, type Href } from "expo-router";
import { Building2, ChevronRight, Search, WifiOff } from "lucide-react-native";
import { FlatList, Pressable, Text, View } from "react-native";

import { EmptyState, LoadingState } from "@rlpapp/ui/native";
import { ObraListItem } from "@/components/campo/obra-list-item";
import { PendingBanner } from "@/components/campo/pending-banner";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card } from "@/components/ui/card";
import { useOnline } from "@/lib/use-online";

/** Primeira tela do app de campo: as obras atribuídas ao técnico. */
export default function MinhasObrasScreen() {
  const router = useRouter();
  const online = useOnline();
  const projects = useQuery(api.technicianPortal.listMyProjects);

  return (
    <View className="flex-1">
      <Stack.Screen options={{ headerRight: () => <ThemeToggle /> }} />

      {projects === undefined ? (
        <View className="flex-1 px-5">
          <PendingBanner onPress={() => router.push("/campo/pendentes" as Href)} />
          {online ? (
            <LoadingState label="Carregando suas obras…" />
          ) : (
            <View className="flex-1 items-center justify-center gap-3 px-4">
              <WifiOff size={32} color="#9ca3af" />
              <Text className="text-center text-sm text-muted-foreground">
                Sem conexão. Conecte-se à internet para carregar suas obras.
              </Text>
            </View>
          )}
        </View>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 10 }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View className="gap-3 pb-2">
              <PendingBanner onPress={() => router.push("/campo/pendentes" as Href)} />
              <Text className="text-sm text-muted-foreground">
                Toque em uma obra para escanear etiquetas e registrar serviços.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <ObraListItem
              project={item}
              onPress={() =>
                router.push({
                  pathname: "/campo/obra/[projectId]",
                  params: { projectId: item._id },
                })
              }
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon={<Building2 size={28} color="#d97706" />}
              title="Nenhuma obra atribuída"
              description="Peça à engenharia para liberar seu acesso. Enquanto isso, você pode procurar a obra abaixo."
            />
          }
          ListFooterComponent={
            <View className="gap-4 pt-4">
              <Pressable
                onPress={() => router.push("/campo/outras-obras" as Href)}
                accessibilityRole="button"
              >
                <Card className="flex-row items-center gap-3 border border-dashed border-border bg-transparent p-4">
                  <View className="h-10 w-10 items-center justify-center rounded-xl bg-muted">
                    <Search size={18} color="#6b7280" />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="font-medium text-foreground">
                      Estou em outra obra
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      Procurar uma obra que não está na sua lista.
                    </Text>
                  </View>
                  <ChevronRight size={16} color="#9ca3af" />
                </Card>
              </Pressable>
              <View className="items-center pt-2">
                <SignOutButton />
              </View>
            </View>
          }
        />
      )}
    </View>
  );
}
