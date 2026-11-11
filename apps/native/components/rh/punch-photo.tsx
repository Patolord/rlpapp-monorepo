import { useAuth } from "@clerk/expo";
import { env } from "@rlpapp/env/native";
import { Image } from "expo-image";
import { ImageOff } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { convexSiteUrl } from "@/lib/field-documents";
import { colors, radius, space, type } from "@/lib/theme";

/**
 * Foto de uma marcação de ponto. A imagem vem da rota HTTP `/time-clock/photo`
 * com o token do Clerk (o app nunca recebe a URL do arquivo; nada fica em cache).
 */
export function PunchPhoto({ punchId, style }: { punchId: string; style?: StyleProp<ViewStyle> }) {
  const { getToken } = useAuth();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void getToken({ template: "convex" })
      .then((t) => alive && setToken(t))
      .catch(() => alive && setToken(null));
    return () => {
      alive = false;
    };
  }, [getToken, punchId]);

  if (token === undefined) {
    return (
      <View style={[styles.box, style]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!token || failed) {
    return (
      <View style={[styles.box, style]}>
        <ImageOff size={22} color={colors.icon} />
        <Text style={[type.caption, { color: colors.textSecondary }]}>Foto indisponível</Text>
      </View>
    );
  }
  return (
    <Image
      source={{
        uri: `${convexSiteUrl(env.EXPO_PUBLIC_CONVEX_URL)}/time-clock/photo/${punchId}`,
        headers: { Authorization: `Bearer ${token}` },
      }}
      cachePolicy="none"
      contentFit="cover"
      onError={() => setFailed(true)}
      style={[styles.box, style as object]}
      accessibilityLabel="Foto da marcação"
    />
  );
}

const styles = StyleSheet.create({
  box: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
  },
});
