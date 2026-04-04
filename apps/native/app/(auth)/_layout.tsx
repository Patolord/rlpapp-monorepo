import { useAuth } from "@clerk/clerk-expo";
import { Redirect, Stack } from "expo-router";
import { useAppTheme } from "@/contexts/app-theme-context";
import { COLORS } from "@/lib/colors";

export default function AuthRoutesLayout() {
  const { isSignedIn } = useAuth();
  const { isDark } = useAppTheme();
  const bg = isDark ? COLORS.dark.background : COLORS.light.background;

  if (isSignedIn) {
    return <Redirect href={"/"} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: bg },
      }}
    />
  );
}
