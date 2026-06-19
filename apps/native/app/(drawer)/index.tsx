import { api } from "@rlpapp/backend/convex/_generated/api";
import { useAuth } from "@clerk/clerk-expo";
import { Authenticated, Unauthenticated, AuthLoading, useQuery } from "convex/react";
import { useRouter, Link } from "expo-router";
import type { Href } from "expo-router";
import {
  Warehouse,
  DollarSign,
  Users,
  HardHat,
  ArrowRight,
  Lock,
} from "lucide-react-native";
import { useEffect } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { Container } from "@/components/container";
import { Button, ButtonText } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SignOutButton } from "@/components/sign-out-button";

const departmentCards = [
  {
    route: "(tabs)",
    title: "Estoque",
    description: "Gestão de produtos, fornecedores, entradas, saídas e movimentações de materiais.",
    icon: Warehouse,
    bgColor: "bg-blue-500/10",
    iconColor: "#3b82f6",
  },
  {
    route: "financeiro",
    title: "Financeiro",
    description: "Contas a pagar e receber, fluxo de caixa, orçamentos e relatórios financeiros.",
    icon: DollarSign,
    bgColor: "bg-emerald-500/10",
    iconColor: "#10b981",
  },
  {
    route: "rh",
    title: "Recursos Humanos",
    description: "Gestão de funcionários, folha de pagamento, benefícios e recrutamento.",
    icon: Users,
    bgColor: "bg-violet-500/10",
    iconColor: "#8b5cf6",
  },
  {
    route: "engenharia",
    title: "Engenharia",
    description: "Projetos, cronogramas, acompanhamento de obras e documentação técnica.",
    icon: HardHat,
    bgColor: "bg-amber-500/10",
    iconColor: "#f59e0b",
  },
] as const;

export default function HomeScreen() {
  return (
    <Container className="px-5 pt-4 pb-4">
      <Authenticated>
        <RoleAwareHome />
      </Authenticated>
      <Unauthenticated>
        <Card className="p-6 items-center">
          <Lock size={48} color="#888" />
          <Text className="text-foreground font-medium mt-4">Bem-vindo ao RLP Engenharia</Text>
          <Text className="text-muted-foreground text-sm text-center mt-2">
            Faça login para acessar o sistema
          </Text>
          <Link href="/(auth)/sign-in" asChild>
            <Button className="mt-4">
              <ButtonText>Entrar</ButtonText>
            </Button>
          </Link>
        </Card>
      </Unauthenticated>
      <AuthLoading>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      </AuthLoading>
    </Container>
  );
}

function RoleAwareHome() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const router = useRouter();
  const isDirector = currentUser?.role === "director";

  useEffect(() => {
    if (currentUser === undefined) return;
    if (currentUser === null) return;
    if (!isDirector) {
      const dest = currentUser.role === "engenheiro"
        ? "/(drawer)/engenharia"
        : "/(drawer)/(tabs)/estoque";
      router.replace(dest as Href);
    }
  }, [currentUser, isDirector, router]);

  if (currentUser === undefined) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!isDirector) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-muted-foreground">Redirecionando...</Text>
      </View>
    );
  }

  return <DirectorDashboard />;
}

function DirectorDashboard() {
  const router = useRouter();

  return (
    <View className="py-6">
      <View className="mb-8">
        <Text className="text-3xl font-bold text-foreground tracking-tight">
          Painel do Diretor
        </Text>
        <Text className="mt-2 text-muted-foreground">
          Selecione um departamento para acessar.
        </Text>
      </View>
      <View className="gap-4">
        {departmentCards.map((dept) => (
          <Pressable
            key={dept.route}
            onPress={() => router.push(`/(drawer)/${dept.route}` as Href)}
          >
            <Card className="flex-row items-center p-4">
              <View className={`w-12 h-12 items-center justify-center rounded-lg ${dept.bgColor}`}>
                <dept.icon size={24} color={dept.iconColor} />
              </View>
              <View className="flex-1 ml-4">
                <Text className="text-foreground text-lg font-semibold">{dept.title}</Text>
                <Text className="text-muted-foreground text-sm mt-0.5" numberOfLines={2}>
                  {dept.description}
                </Text>
              </View>
              <ArrowRight size={20} color="#9ca3af" />
            </Card>
          </Pressable>
        ))}
      </View>
      <View className="mt-8">
        <SignOutButton />
      </View>
    </View>
  );
}
