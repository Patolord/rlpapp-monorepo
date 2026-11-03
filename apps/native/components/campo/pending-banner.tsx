import { ChevronRight, CloudUpload, WifiOff } from "lucide-react-native";
import { Pressable, StyleSheet, Text } from "react-native";

import { colors, radius, space } from "@/lib/theme";
import { useOnline } from "@/lib/use-online";
import { usePendingCount } from "@/lib/use-pending-records";

/** Aviso de registros feitos sem internet ainda não enviados: uma linha só. */
export function PendingBanner({ onPress }: { onPress: () => void }) {
  const count = usePendingCount();
  const online = useOnline();
  if (count === 0) return null;

  const Icon = online ? CloudUpload : WifiOff;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint={online ? "Aguardando envio" : "Aguardando conexão"}
      style={({ pressed }) => [styles.banner, pressed && { opacity: 0.85 }]}
    >
      <Icon size={26} color={colors.warning} strokeWidth={2.2} />
      <Text style={styles.text}>{count} para enviar</Text>
      <ChevronRight size={24} color={colors.warning} strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
  },
  text: { flex: 1, fontSize: 18, lineHeight: 24, fontWeight: "700", color: colors.text },
});
