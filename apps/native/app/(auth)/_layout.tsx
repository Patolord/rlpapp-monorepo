import { useAuth } from "@clerk/expo";
import { Redirect, Stack } from "expo-router";
import { COLORS } from "@/lib/colors";

export default function AuthRoutesLayout() {
  const { isSignedIn } = useAuth();
  const bg = COLORS.background;

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
