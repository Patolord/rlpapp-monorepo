import { useClerk } from "@clerk/expo";
import { useRouter } from "expo-router";
import { LogOut } from "lucide-react-native";
import { View } from "react-native";

import { Button, ButtonText } from "@/components/ui/button";

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
    <Button variant="outline" onPress={handleSignOut}>
      <View className="flex-row items-center gap-2">
        <LogOut size={16} color="#666" />
        <ButtonText variant="outline">Sair</ButtonText>
      </View>
    </Button>
  );
};
