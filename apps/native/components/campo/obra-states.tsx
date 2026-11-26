import { useRouter, type Href } from "expo-router";
import { ShieldAlert, WifiOff } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import type { FieldObra } from "@/components/campo/obra";
import { EmptyState, LoadingState } from "@/components/ui";
import { colors, space } from "@/lib/theme";
import { useOnline } from "@/lib/use-online";

/** Tela inteira para dados que dependem de internet e ainda não chegaram. */
export function OfflineState({ description }: { description: string }) {
  return (
    <View style={styles.centered}>
      <EmptyState
        tone="warning"
        icon={<WifiOff size={30} color={colors.warning} strokeWidth={1.8} />}
        title="Sem conexão"
        description={description}
      />
    </View>
  );
}

/**
 * O que a tela mostra enquanto a obra não está disponível para o usuário:
 * abrindo, sem conexão, não encontrada ou sem atribuição. Use antes de
 * consultar o que exige estar na obra:
 * `if (obra == null || !obra.assigned) return <ObraUnavailable ... />`.
 */
export function ObraUnavailable({
  obra,
  offlineDescription,
  deniedTitle,
  deniedDescription,
}: {
  obra: FieldObra | null | undefined;
  offlineDescription: string;
  deniedTitle: string;
  deniedDescription: string;
}) {
  const router = useRouter();
  const online = useOnline();

  if (obra === undefined) {
    return online ? <LoadingState message="Abrindo obra..." /> : <OfflineState description={offlineDescription} />;
  }

  if (obra === null) {
    return (
      <View style={styles.centered}>
        <EmptyState
          tone="neutral"
          icon={<ShieldAlert size={30} color={colors.textSecondary} strokeWidth={1.8} />}
          title="Obra não encontrada"
          description="Esta obra não existe mais ou foi arquivada."
          actionLabel="Voltar para minhas obras"
          onAction={() => router.replace("/campo" as Href)}
        />
      </View>
    );
  }

  return (
    <View style={styles.centered}>
      <EmptyState
        tone="warning"
        icon={<ShieldAlert size={30} color={colors.warning} strokeWidth={1.8} />}
        title={deniedTitle}
        description={deniedDescription}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", paddingHorizontal: space.screen },
});
