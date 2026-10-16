import { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex/react";
import { useRouter, type Href } from "expo-router";
import { Building2, ChevronRight, Search, WifiOff } from "lucide-react-native";
import { useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

import { EmptyState, LoadingState } from "@rlpapp/ui/native";
import { ObraListItem } from "@/components/campo/obra-list-item";
import { PendingBanner } from "@/components/campo/pending-banner";
import { SignOutButton } from "@/components/sign-out-button";
import { Card } from "@/components/ui/card";
import { cacheFieldObra, cacheMyObras, getCachedMyObras } from "@/lib/field-cache";
import { useOnline } from "@/lib/use-online";

type MyObra = FunctionReturnType<typeof api.technicianPortal.listMyProjects>[number];

/** Primeira tela do app de campo: as obras atribuídas ao técnico. */
export default function MinhasObrasScreen() {
  const router = useRouter();
  const online = useOnline();
  const live = useQuery(api.technicianPortal.listMyProjects);
  const [cached, setCached] = useState<MyObra[] | null | undefined>(undefined);

  useEffect(() => {
    if (live !== undefined) {
      void cacheMyObras(live);
      for (const project of live) {
        void cacheFieldObra(project._id, { ...project, assigned: true });
      }
      return;
    }
    let alive = true;
    void getCachedMyObras<MyObra>().then((value) => {
      if (alive) setCached(value);
    });
    return () => {
      alive = false;
    };
  }, [live]);

  const projects =
    live !== undefined ? live : online || cached == null ? undefined : cached;

  return (
    <View className="flex-1">
      {projects === undefined ? (
        <View className="flex-1 px-5">
          <PendingBanner onPress={() => router.push("/campo/pendentes" as Href)} />
          {online || cached === undefined ? (
            <LoadingState label="Carregando suas obras…" />
          ) : (
            <View className="flex-1 items-center justify-center gap-3 px-4">
              <WifiOff size={32} color="#9ca3af" />
              <Text className="text-center text-sm text-muted-foreground">
                Sem conexão. Abra o app com internet uma vez para guardar suas obras
                neste aparelho.
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
              {live === undefined ? (
                <Text className="text-xs text-muted-foreground">
                  Lista salva neste aparelho — pode estar desatualizada.
                </Text>
              ) : null}
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
