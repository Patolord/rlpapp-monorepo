import { useAuth } from "@clerk/expo";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex/react";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { Building2, Search, WifiOff } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { EmptyState, LoadingState } from "@rlpapp/ui/native";
import { BigAction } from "@/components/campo/field-ui";
import { ObraListItem } from "@/components/campo/obra-list-item";
import { PendingBanner } from "@/components/campo/pending-banner";
import { PontoButton } from "@/components/campo/ponto-button";
import { SignOutButton } from "@/components/sign-out-button";
import {
  cacheFieldObra,
  cacheMyObras,
  getCachedMyObras,
  getLastFieldObra,
} from "@/lib/field-cache";
import { pruneOfflineProjects } from "@/lib/field-documents";
import { colors, space, type } from "@/lib/theme";
import { useOnline } from "@/lib/use-online";

type MyObra = FunctionReturnType<typeof api.technicianPortal.listMyProjects>[number];

/** Primeira tela do app de campo: as obras atribuídas ao técnico. */
export default function MinhasObrasScreen() {
  const router = useRouter();
  const online = useOnline();
  const { userId } = useAuth();
  const live = useQuery(api.technicianPortal.listMyProjects);
  const [cached, setCached] = useState<MyObra[] | null | undefined>(undefined);
  const [lastObraId, setLastObraId] = useState<string | null>(null);

  useEffect(() => {
    if (live !== undefined) {
      void cacheMyObras(live);
      for (const project of live) {
        void cacheFieldObra(project._id, { ...project, assigned: true });
      }
      // PDFs salvos de obras que saíram da lista (arquivadas ou acesso
      // revogado) não podem continuar neste aparelho.
      if (userId) void pruneOfflineProjects(userId, live.map((project) => project._id));
      return;
    }
    let alive = true;
    void getCachedMyObras<MyObra>().then((value) => {
      if (alive) setCached(value);
    });
    return () => {
      alive = false;
    };
  }, [live, userId]);

  // Relido ao voltar para a tela: a obra pode ter sido aberta por outro caminho.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void getLastFieldObra().then((value) => {
        if (alive) setLastObraId(value);
      });
      return () => {
        alive = false;
      };
    }, [])
  );

  const list = live !== undefined ? live : online || cached == null ? undefined : cached;
  // A última obra aberta vai para o topo, em destaque.
  const projects = list && lastObraId
    ? [...list].sort((a, b) => Number(b._id === lastObraId) - Number(a._id === lastObraId))
    : list;

  function openObra(projectId: string) {
    setLastObraId(projectId);
    router.push({ pathname: "/campo/obra/[projectId]", params: { projectId } });
  }

  return (
    <View style={styles.screen}>
      {projects === undefined ? (
        <View style={styles.centered}>
          <PendingBanner onPress={() => router.push("/campo/pendentes" as Href)} />
          {online || cached === undefined ? (
            <LoadingState label="Carregando suas obras…" />
          ) : (
            <View style={styles.offline}>
              <WifiOff size={40} color={colors.icon} />
              <Text style={styles.offlineText}>Sem internet. Abra o app com sinal uma vez.</Text>
            </View>
          )}
        </View>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={styles.header}>
              <PendingBanner onPress={() => router.push("/campo/pendentes" as Href)} />
              <PontoButton onPress={() => router.push("/campo/ponto" as Href)} />
              <Text style={styles.sectionTitle}>Minhas obras</Text>
            </View>
          }
          renderItem={({ item }) => (
            <ObraListItem
              project={item}
              highlight={item._id === lastObraId}
              onPress={() => openObra(item._id)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon={<Building2 size={28} color={colors.primary} />}
              title="Nenhuma obra"
              description="Peça acesso à engenharia."
            />
          }
          ListFooterComponent={
            <View style={styles.footer}>
              <BigAction
                variant="secondary"
                size="md"
                label="Outra obra"
                icon={<Search size={22} color={colors.text} strokeWidth={2.2} />}
                onPress={() => router.push("/campo/outras-obras" as Href)}
                style={styles.otherObra}
              />
              {live === undefined ? (
                <Text style={styles.cachedNote}>Sem internet: lista salva no aparelho.</Text>
              ) : null}
              <View style={styles.signOut}>
                <SignOutButton />
              </View>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, padding: space.lg, gap: space.lg },
  offline: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.md, paddingHorizontal: space.xl },
  offlineText: { ...type.body, textAlign: "center", color: colors.textSecondary },
  list: { padding: space.lg, paddingBottom: 48, gap: space.md },
  header: { gap: space.lg, paddingBottom: space.xs },
  sectionTitle: { fontSize: 20, lineHeight: 26, fontWeight: "700", color: colors.text, paddingTop: space.sm, paddingHorizontal: space.xs },
  footer: { gap: space.lg, paddingTop: space.sm },
  otherObra: { borderStyle: "dashed", borderWidth: 2, borderColor: colors.borderStrong },
  cachedNote: { ...type.label, textAlign: "center", color: colors.textSecondary },
  signOut: { alignItems: "center", paddingTop: space.sm },
});
