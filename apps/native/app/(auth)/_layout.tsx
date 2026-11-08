import { useAuth } from "@clerk/expo";
import { Redirect, Stack } from "expo-router";
import { colors } from "@/lib/theme";

export default function AuthRoutesLayout() {
  const { isSignedIn } = useAuth();
  const bg = colors.bg;

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
