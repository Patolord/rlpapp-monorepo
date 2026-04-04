import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Text, View } from "react-native";

import { Container } from "@/components/container";
import { Button, ButtonText } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function Modal() {
  function handleClose() {
    router.back();
  }

  return (
    <Container>
      <View className="flex-1 justify-center items-center p-4">
        <Card className="p-5 w-full max-w-sm">
          <View className="items-center">
            <View className="w-12 h-12 bg-accent rounded-lg items-center justify-center mb-3">
              <Ionicons name="checkmark" size={24} color="#333" />
            </View>
            <Text className="text-foreground font-medium text-lg mb-1">Modal Screen</Text>
            <Text className="text-muted-foreground text-sm text-center mb-4">
              This is an example modal screen for dialogs and confirmations.
            </Text>
          </View>
          <Button onPress={handleClose} className="w-full">
            <ButtonText>Fechar</ButtonText>
          </Button>
        </Card>
      </View>
    </Container>
  );
}

export default Modal;
