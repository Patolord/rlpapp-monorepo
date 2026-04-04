import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import { cn } from "@/lib/utils";

function Skeleton({ className }: { className?: string }) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <View className={cn("rounded-md bg-muted", className)}>
      <Animated.View style={{ opacity }} className="h-full w-full rounded-md bg-muted" />
    </View>
  );
}

export { Skeleton };
