import { useRouter } from "expo-router";
import { SearchX } from "lucide-react-native";
import React from "react";
import { StyleSheet, View } from "react-native";

import { EmptyState } from "@/components/ui";
import { colors, space } from "@/lib/theme";

/** Aviso de item removido ou já resolvido (ficha S16). */
export default function IndisponivelScreen() {
  const router = useRouter();
  return (
    <View style={styles.screen}>
      <EmptyState
        icon={<SearchX size={28} color={colors.primary} />}
        title="Este item não está mais disponível"
        description="Ele pode ter sido cancelado, removido ou já resolvido por outra pessoa."
        actionLabel="Voltar"
        onAction={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", padding: space.screen },
});
