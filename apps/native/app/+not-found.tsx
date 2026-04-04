import { Link, Stack } from "expo-router";
import { Text, View } from "react-native";

import { Container } from "@/components/container";
import { Button, ButtonText } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Container>
        <View className="flex-1 justify-center items-center p-4">
          <Card className="items-center p-6 max-w-sm">
            <Text className="text-4xl mb-3">🤔</Text>
            <Text className="text-foreground font-medium text-lg mb-1">Página não encontrada</Text>
            <Text className="text-muted-foreground text-sm text-center mb-4">
              A página que você procura não existe.
            </Text>
            <Link href="/" asChild>
              <Button>
                <ButtonText>Ir para o início</ButtonText>
              </Button>
            </Link>
          </Card>
        </View>
      </Container>
    </>
  );
}
