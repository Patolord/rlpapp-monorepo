import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { Building2, Search } from "lucide-react-native";
import { useMemo, useState } from "react";
import { FlatList, Text, View } from "react-native";

import { EmptyState, LoadingState } from "@rlpapp/ui/native";
import { ObraListItem } from "@/components/campo/obra-list-item";
import { Input } from "@/components/ui/input";

/**
 * Válvula de escape: o técnico foi deslocado para uma obra que não está na
 * lista dele. Qualquer obra ativa com etiquetas pode ser aberta; a tela da
 * obra avisa que ele não está atribuído, mas não bloqueia.
 */
export default function OutrasObrasScreen() {
  const router = useRouter();
  const projects = useQuery(api.technicianPortal.listBrowsableProjects);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!projects) return [];
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return projects;
    return projects.filter((project) =>
      [
        project.name,
        project.legacyNumber?.toString(),
        project.client,
        project.address,
      ].some((value) => value?.toLocaleLowerCase("pt-BR").includes(term))
    );
  }, [projects, search]);

  return (
    <View className="flex-1">
      <View className="gap-2 px-5 pb-2 pt-4">
        <View className="flex-row items-center gap-2 rounded-lg border border-input bg-card px-3">
          <Search size={16} color="#9ca3af" />
          <Input
            className="h-12 flex-1 border-0 bg-transparent px-0 text-base"
            placeholder="Obra, nº, cliente ou endereço"
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
        </View>
        <Text className="text-xs text-muted-foreground">
          Abrir uma obra daqui não muda suas atribuições. Avise a engenharia se
          for ficar nela.
        </Text>
      </View>

      {projects === undefined ? (
        <LoadingState label="Carregando obras…" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40, gap: 10 }}
          keyboardShouldPersistTaps="handled"
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
              title={search.trim() ? "Nenhuma obra encontrada" : "Nenhuma obra com etiquetas"}
              description={
                search.trim()
                  ? "Tente outro nome, número ou endereço."
                  : "Nenhuma obra ativa possui etiquetas QR no momento."
              }
            />
          }
        />
      )}
    </View>
  );
}
