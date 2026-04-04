import { Users } from "lucide-react-native";
import { Text, View } from "react-native";

import { Container } from "@/components/container";

export default function RhScreen() {
  return (
    <Container className="px-5 pt-4 pb-4">
      <View className="flex-1 items-center justify-center py-24">
        <View className="w-16 h-16 items-center justify-center rounded-full bg-violet-500/10">
          <Users size={32} color="#8b5cf6" />
        </View>
        <Text className="mt-6 text-2xl font-bold text-foreground">Recursos Humanos</Text>
        <Text className="mt-2 text-muted-foreground text-sm text-center max-w-xs">
          O módulo de RH está em desenvolvimento. Em breve você terá acesso a gestão de funcionários, folha de pagamento e benefícios.
        </Text>
      </View>
    </Container>
  );
}
