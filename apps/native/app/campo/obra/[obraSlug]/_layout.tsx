import { useAuth } from "@clerk/expo";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { ShieldAlert } from "lucide-react-native";
import { useEffect } from "react";
import { View } from "react-native";

import { FieldObraProvider } from "@/components/campo/obra-context";
import { EmptyState, LoadingState, Screen, ScreenHeader } from "@/components/ui";
import { forgetProject } from "@/lib/field-documents";
import { forgetCachedQuery, useCachedQuery } from "@/lib/use-cached-query";
import { colors, space } from "@/lib/theme";
import { useOnline } from "@/lib/use-online";

/**
 * Carrega o resumo da obra do técnico e expõe via contexto para as telas
 * filhas (hub, documentos, etiquetas, estoque).
 */
export default function CampoObraLayout() {
  const { obraSlug } = useLocalSearchParams<{ obraSlug: string }>();
  const router = useRouter();
  const online = useOnline();
  const { userId } = useAuth();
  const cacheKey = userId && obraSlug ? `obra:${userId}:${obraSlug}` : null;
  const { data: obra, fromCache, cacheChecked } = useCachedQuery(
    cacheKey,
    api.technicianPortal.getMyProject,
    { identifier: obraSlug ?? "" }
  );

  // Resposta ao vivo "não existe / arquivada": nada dela pode continuar offline.
  useEffect(() => {
    if (obra !== null || fromCache || !userId || !obraSlug || !cacheKey) return;
    void forgetProject(userId, obraSlug);
    void forgetCachedQuery(cacheKey);
  }, [obra, fromCache, userId, obraSlug, cacheKey]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/qr-operador" as Href));

  if (obra === undefined) {
    if (!cacheChecked) return <Screen>{null}</Screen>;
    return (
      <Screen>
        <ScreenHeader title="Obra" onBack={goBack} />
        {online ? (
          <LoadingState message="Abrindo obra..." />
        ) : (
          <View style={{ paddingHorizontal: space.screen }}>
            <EmptyState
              tone="warning"
              icon={<ShieldAlert size={30} color={colors.warning} strokeWidth={1.8} />}
              title="Sem conexão"
              description="Esta obra ainda não foi aberta neste aparelho."
            />
          </View>
        )}
      </Screen>
    );
  }

  if (obra === null) {
    return (
      <Screen>
        <ScreenHeader title="Obra" onBack={goBack} />
        <View style={{ paddingHorizontal: space.screen }}>
          <EmptyState
            tone="neutral"
            icon={<ShieldAlert size={30} color={colors.textSecondary} strokeWidth={1.8} />}
            title="Obra não encontrada"
            description="A obra não existe, foi arquivada ou você não tem mais acesso. Peça à engenharia para liberar."
            actionLabel="Voltar para minhas obras"
            onAction={goBack}
          />
        </View>
      </Screen>
    );
  }

  return (
    <FieldObraProvider value={{ obra, obraSlug: obraSlug!, fromCache }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
    </FieldObraProvider>
  );
}
