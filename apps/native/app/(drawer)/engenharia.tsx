import { HardHat } from "lucide-react-native";
import { Text, View } from "react-native";

import { Container } from "@/components/container";

export default function EngenhariaScreen() {
  return (
    <Container className="px-5 pt-4 pb-4">
      <View className="flex-1 items-center justify-center py-24">
        <View className="w-16 h-16 items-center justify-center rounded-full bg-amber-500/10">
          <HardHat size={32} color="#f59e0b" />
        </View>
        <Text className="mt-6 text-2xl font-bold text-foreground">Engenharia</Text>
        <Text className="mt-2 text-muted-foreground text-sm text-center max-w-xs">
          O módulo de engenharia está em desenvolvimento. Em breve você terá acesso a projetos, cronogramas e documentação técnica.
        </Text>
      </View>
    </Container>
  );
}
