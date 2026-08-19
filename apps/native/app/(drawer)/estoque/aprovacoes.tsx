import { api } from "@rlpapp/backend/convex/_generated/api";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useMutation,
  useQuery,
} from "convex/react";
import { Lock, ShieldAlert } from "lucide-react-native";
import { useState } from "react";
import { FlatList, Text, View } from "react-native";
import { Link } from "expo-router";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  LoadingState,
} from "@rlpapp/ui/native";
import { Button, ButtonText } from "@/components/ui/button";
import { ApprovalCard } from "@/components/estoque/approval-card";

export default function AprovacoesScreen() {
  return (
    <View className="flex-1 px-5 pt-4 pb-4">
      <Authenticated>
        <AprovacoesContent />
      </Authenticated>
      <Unauthenticated>
        <Card className="p-6 items-center">
          <Lock size={48} color="#888" />
          <Text className="text-foreground font-medium mt-4">Acesso Restrito</Text>
          <Text className="text-muted-foreground text-sm text-center mt-2">
            Faça login para acessar
          </Text>
          <Link href="/(auth)/sign-in" asChild>
            <Button className="mt-4">
              <ButtonText>Entrar</ButtonText>
            </Button>
          </Link>
        </Card>
      </Unauthenticated>
      <AuthLoading>
        <LoadingState />
      </AuthLoading>
    </View>
  );
}

function AprovacoesContent() {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const pendingApprovals = useQuery(api.inventory.listPendingApprovals);
  const reviewDocument = useMutation(api.inventory.reviewDocument);

  const handleApprove = async (id: string) => {
    setLoadingId(id);
    try {
      await reviewDocument({
        documentId: id as never,
        decision: "approve",
        reason: "Aprovado via app",
      });
    } finally {
      setLoadingId(null);
    }
  };

  const handleReject = async (id: string) => {
    setLoadingId(id);
    try {
      await reviewDocument({
        documentId: id as never,
        decision: "reject",
        reason: "Rejeitado via app",
      });
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <View className="gap-4 flex-1">
      <View>
        <Text className="text-2xl font-bold text-foreground">Aprovações</Text>
        <Text className="text-muted-foreground text-sm">
          Solicitações pendentes de aprovação
        </Text>
      </View>

      <Card className="flex-1">
        <CardHeader>
          <View className="flex-row items-center gap-2">
            <ShieldAlert size={20} color="#f59e0b" />
            <CardTitle>Pendentes</CardTitle>
          </View>
          <CardDescription>
            {pendingApprovals?.length ?? 0} aprovações pendentes
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1">
          {!pendingApprovals ? (
            <LoadingState size="small" />
          ) : pendingApprovals.length === 0 ? (
            <EmptyState
              variant="plain"
              title="Nenhuma aprovação pendente"
            />
          ) : (
            <FlatList
              data={pendingApprovals}
              keyExtractor={(item) => item._id}
              renderItem={({ item }) => {
                const firstItem = item.items[0];
                const totalQty = item.items.reduce(
                  (sum, line) => sum + line.quantity,
                  0,
                );
                return (
                  <ApprovalCard
                    materialName={
                      firstItem?.materialName ??
                      (item.items.length > 1
                        ? `${item.items.length} materiais`
                        : "Material")
                    }
                    quantity={totalQty}
                    requesterName={item.createdByName}
                    createdAt={item.createdAt}
                    onApprove={() => handleApprove(item._id)}
                    onReject={() => handleReject(item._id)}
                    isLoading={loadingId === item._id}
                  />
                );
              }}
              ItemSeparatorComponent={() => <View className="h-3" />}
              scrollEnabled={false}
            />
          )}
        </CardContent>
      </Card>
    </View>
  );
}
