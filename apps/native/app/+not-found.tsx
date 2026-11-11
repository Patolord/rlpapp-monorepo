import { Stack, useRouter } from "expo-router";
import { SearchX } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import { EmptyState } from "@/components/ui";
import { colors, space } from "@/lib/theme";

/** Endereço que não existe no app (link antigo ou aviso de item removido). */
export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <EmptyState
        icon={<SearchX size={28} color={colors.primary} />}
        title="Esta página não existe"
        description="O link pode estar antigo ou o item foi removido."
        actionLabel="Ir para o início"
        onAction={() => router.replace("/")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", padding: space.screen },
});
