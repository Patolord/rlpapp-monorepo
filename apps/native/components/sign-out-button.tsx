import { useClerk } from "@clerk/expo";
import { useRouter } from "expo-router";
import { LogOut } from "lucide-react-native";

import { AppButton } from "@/components/ui";
import { colors } from "@/lib/theme";

export const SignOutButton = () => {
  const { signOut } = useClerk();
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace("/");
    } catch (err) {
      console.error(JSON.stringify(err, null, 2));
    }
  };

  return (
    <AppButton
      label="Sair"
      variant="secondary"
      size="sm"
      icon={<LogOut size={18} color={colors.text} strokeWidth={2} />}
      onPress={handleSignOut}
    />
  );
};
