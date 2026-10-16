import { type PropsWithChildren } from "react";
import { ScrollView, View, type ViewProps } from "react-native";
import Animated, { type AnimatedProps } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "@/lib/utils";
import { COLORS } from "@/lib/colors";

const AnimatedView = Animated.createAnimatedComponent(View);

type Props = AnimatedProps<ViewProps> & {
  className?: string;
};

export function Container({ children, className, ...props }: PropsWithChildren<Props>) {
  const insets = useSafeAreaInsets();
  const bg = COLORS.background;

  return (
    <AnimatedView
      className={cn("flex-1", className)}
      style={{
        backgroundColor: bg,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
      {...props}
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: bg }}
        contentContainerStyle={{ flexGrow: 1 }}
      >
        {children}
      </ScrollView>
    </AnimatedView>
  );
}
