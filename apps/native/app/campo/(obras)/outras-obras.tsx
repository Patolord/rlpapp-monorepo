import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { Building2 } from "lucide-react-native";
import { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { ObraListItem } from "@/components/campo/obra-list-item";
import { EmptyState, LoadingState, SearchField } from "@/components/ui";
import { colors, space, type } from "@/lib/theme";

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
    <View style={styles.screen}>
      <View style={styles.top}>
        <SearchField
          placeholder="Obra, nº, cliente ou endereço"
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        <Text style={styles.note}>
          Abrir uma obra daqui não muda suas atribuições. Avise a engenharia se for ficar nela.
        </Text>
      </View>

      {projects === undefined ? (
        <LoadingState message="Carregando obras…" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
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
              icon={<Building2 size={28} color={colors.primary} />}
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { gap: space.sm, paddingHorizontal: space.screen, paddingTop: space.lg, paddingBottom: space.sm },
  note: { ...type.bodySm, color: colors.textSecondaryOnBg },
  list: { padding: space.screen, paddingTop: space.sm, paddingBottom: 40, gap: space.md },
});
