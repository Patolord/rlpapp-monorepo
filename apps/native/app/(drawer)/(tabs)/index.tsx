import { Text, View } from "react-native";
import { Container } from "@/components/container";
import { Card } from "@/components/ui/card";

export default function TabHome() {
  return (
    <Container className="px-5 pt-4 pb-24">
      <View className="flex-1 justify-center items-center">
        <Card className="p-8 items-center">
          <Text className="text-3xl font-bold text-foreground mb-2">Estoque</Text>
          <Text className="text-muted-foreground text-center">
            Use as abas abaixo para navegar pelo módulo de estoque
          </Text>
        </Card>
      </View>
    </Container>
  );
}
