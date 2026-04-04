import { DollarSign } from "lucide-react-native";
import { Text, View } from "react-native";

import { Container } from "@/components/container";

export default function FinanceiroScreen() {
  return (
    <Container className="px-5 pt-4 pb-4">
      <View className="flex-1 items-center justify-center py-24">
        <View className="w-16 h-16 items-center justify-center rounded-full bg-emerald-500/10">
          <DollarSign size={32} color="#10b981" />
        </View>
        <Text className="mt-6 text-2xl font-bold text-foreground">Financeiro</Text>
        <Text className="mt-2 text-muted-foreground text-sm text-center max-w-xs">
          O módulo financeiro está em desenvolvimento. Em breve você terá acesso a contas a pagar, receber, fluxo de caixa e relatórios.
        </Text>
      </View>
    </Container>
  );
}
