import { useEffect } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { Backdrop, BRAND } from "@/components/auth/brand";
import { RlpLogo } from "@/components/auth/rlp-logo";

const TRACK_WIDTH = 340;
const BAR_WIDTH = 130;

/**
 * Full-screen launch state shown while the session is being restored.
 * Mirrors the native splash so the hand-off from the OS splash is seamless.
 */
export function LoadingScreen({ message = "Carregando..." }: { message?: string }) {
  const { width, height } = useWindowDimensions();
  const c = BRAND;

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.cubic) }),
      -1,
      false,
    );
  }, [progress]);

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -BAR_WIDTH + progress.value * (TRACK_WIDTH + BAR_WIDTH) }],
  }));

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <Backdrop width={width} height={height} c={c} />

      <View style={styles.center}>
        <RlpLogo size={200} color={c.logo} lightColor={c.logoLight} textColor={c.logoText} />
      </View>

      <View style={styles.footer}>
        <View style={[styles.track, { backgroundColor: c.track }]}>
          <Animated.View style={[styles.bar, { backgroundColor: c.button }, barStyle]} />
        </View>
        <Text style={[styles.message, { color: c.title }]}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 60,
  },
  footer: {
    alignItems: "center",
    paddingBottom: "22%",
    gap: 28,
  },
  track: {
    width: TRACK_WIDTH,
    maxWidth: "80%",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  bar: {
    width: BAR_WIDTH,
    height: "100%",
    borderRadius: 3,
  },
  message: {
    fontSize: 24,
    fontWeight: "400",
  },
});
