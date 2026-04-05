import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { Lock } from "lucide-react-native";
import { ActivityIndicator, Text, View } from "react-native";
import { Link } from "expo-router";

import { InventoryAjustesContent } from "@/components/inventory-ajustes-content";
import { Container } from "@/components/container";
import { Button, ButtonText } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function AjusteTab() {
  return (
    <Container className="px-5 pt-4 pb-24">
      <Authenticated>
        <InventoryAjustesContent />
      </Authenticated>
      <Unauthenticated>
        <Card className="p-6 items-center">
          <Lock size={48} color="#888" />
          <Text className="text-foreground font-medium mt-4">Acesso Restrito</Text>
          <Text className="text-muted-foreground text-sm text-center mt-2">Faça login para acessar</Text>
          <Link href="/(auth)/sign-in" asChild>
            <Button className="mt-4"><ButtonText>Entrar</ButtonText></Button>
          </Link>
        </Card>
      </Unauthenticated>
      <AuthLoading>
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" /></View>
      </AuthLoading>
    </Container>
  );
}
