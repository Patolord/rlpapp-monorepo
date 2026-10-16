import { api } from "@rlpapp/backend/convex/_generated/api";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { Redirect, useRouter, type Href } from "expo-router";
import { Building2, History, Keyboard, ScanLine } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { LoadingScreen } from "@/components/auth/loading-screen";
import { MyObrasList } from "@/components/campo/my-obras-list";
import { OfflineBanner } from "@/components/campo/offline-banner";
import { SignOutButton } from "@/components/sign-out-button";
import { AppButton, ListRow, Pill, Screen, ScreenHeader, SectionTitle, Surface } from "@/components/ui";
import { listPendingRecords, subscribeQueue } from "@/lib/offline-queue";
import { colors, space, type } from "@/lib/theme";
import { useOnline } from "@/lib/use-online";

function usePendingCount() {
  const [count, setCount] = useState(0);
  const refresh = useCallback(async () => {
    const records = await listPendingRecords();
    setCount(records.length);
  }, []);
  useEffect(() => {
    void refresh();
    return subscribeQueue(() => void refresh());
  }, [refresh]);
  return count;
}

/** Hub do técnico em campo: minhas obras, registrar serviço, buscar etiqueta. */
export default function CampoHubScreen() {
  return (
    <>
      <Authenticated>
        <CampoHub />
      </Authenticated>
      <Unauthenticated>
        <Redirect href="/(auth)/sign-in" />
      </Unauthenticated>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>
    </>
  );
}

function CampoHub() {
  const router = useRouter();
  const online = useOnline();
  const pendingCount = usePendingCount();
  const currentUser = useQuery(api.users.getCurrentUser);
  const isTechnician = currentUser?.role === "qr_operator";

  // Escritório chegou aqui pelo menu: pode voltar. Técnico: este é o início.
  const canGoBack = currentUser !== undefined && !isTechnician;

  return (
    <Screen>
      <ScreenHeader
        title="Campo"
        subtitle={currentUser?.name ? `Olá, ${currentUser.name.split(" ")[0]}` : "Suas obras e registros"}
        onBack={canGoBack ? () => (router.canGoBack() ? router.back() : router.replace("/(drawer)" as Href)) : undefined}
        right={isTechnician ? <SignOutButton /> : undefined}
        large
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <OfflineBanner detail="Suas obras e os PDFs salvos continuam disponíveis." />

        <Surface style={{ gap: space.md }}>
          <Text style={[type.heading, { color: colors.text }]}>Registrar serviço</Text>
          <Text style={[type.bodySm, { color: colors.textSecondary }]}>
            Escaneie a etiqueta do equipamento ou digite o código.
          </Text>
          <AppButton
            label="Escanear etiqueta"
            icon={<ScanLine size={22} color={colors.onPrimary} strokeWidth={2} />}
            onPress={() => router.push("/scanner" as Href)}
            disabled={!online}
          />
          {!online ? (
            <Text style={[type.caption, { color: colors.textMuted }]}>
              O leitor de QR precisa de conexão para abrir a etiqueta.
            </Text>
          ) : null}
          <View style={styles.row}>
            <AppButton
              label="Digitar código"
              variant="secondary"
              size="sm"
              icon={<Keyboard size={18} color={colors.text} strokeWidth={2} />}
              onPress={() => router.push("/meus-registros?action=manual" as Href)}
              style={{ flex: 1 }}
            />
            <AppButton
              label="Meus registros"
              variant="secondary"
              size="sm"
              icon={<History size={18} color={colors.text} strokeWidth={2} />}
              trailing={pendingCount > 0 ? <Pill label={String(pendingCount)} tone="warning" /> : null}
              onPress={() => router.push("/meus-registros?action=history" as Href)}
              style={{ flex: 1 }}
            />
          </View>
        </Surface>

        <SectionTitle title="Minhas obras" style={styles.section} />
        <MyObrasList />

        <SectionTitle title="Outras obras" style={styles.section} />
        <ListRow
          icon={<Building2 size={22} color={colors.primary} strokeWidth={1.8} />}
          title="Buscar etiqueta em outra obra"
          subtitle="Equipamentos de obras que não estão atribuídas a você."
          onPress={() => router.push("/meus-registros?action=projects" as Href)}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.screen,
    paddingBottom: space.xxl * 2,
    gap: space.md,
  },
  row: { flexDirection: "row", gap: space.md },
  section: { paddingHorizontal: 0, paddingTop: space.md },
});
