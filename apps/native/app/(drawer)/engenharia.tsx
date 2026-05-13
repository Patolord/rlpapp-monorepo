import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useQuery,
  useMutation,
  usePaginatedQuery,
} from "convex/react";
import {
  QrCode,
  Search,
  Trash2,
  Lock,
  Package,
  Link2,
  Hash,
  ChevronRight,
  X,
} from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Share,
  Text,
  View,
} from "react-native";
import { useRouter, Link } from "expo-router";

import { Container } from "@/components/container";
import { Button, ButtonText } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export default function EngenhariaScreen() {
  return (
    <Container className="px-5 pt-4 pb-24">
      <Authenticated>
        <EngenhariaContent />
      </Authenticated>
      <Unauthenticated>
        <Card className="p-6 items-center">
          <Lock size={48} color="#888" />
          <Text className="text-foreground font-medium mt-4">
            Acesso Restrito
          </Text>
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
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      </AuthLoading>
    </Container>
  );
}

function EngenhariaContent() {
  const router = useRouter();
  const stats = useQuery(api.qrCodes.stats, {});
  const equipment = useQuery(api.equipment.list);
  const batches = useQuery(api.qrCodes.listBatches, { limit: 8 });

  const [searchTerm, setSearchTerm] = useState("");
  const [activeBatchId, setActiveBatchId] = useState<Id<"qrBatches"> | null>(
    null
  );
  const activeBatch = batches?.find((b: any) => b._id === activeBatchId);

  const searchResults = useQuery(
    api.qrCodes.search,
    searchTerm.trim().length >= 2 ? { term: searchTerm.trim() } : "skip"
  );

  const removeQR = useMutation(api.qrCodes.remove);
  const removeMany = useMutation(api.qrCodes.removeMany);

  const totalEquipment = equipment?.length ?? 0;
  const operationalCount =
    equipment?.filter((e: any) => e.status === "operational").length ?? 0;

  const handleDeleteQR = (qrId: Id<"qrCodes">, isLinked: boolean) => {
    if (isLinked) {
      Alert.alert("Erro", "QR Codes vinculados não podem ser excluídos.");
      return;
    }
    Alert.alert("Confirmar exclusão", "Deseja excluir este QR Code?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          try {
            await removeQR({ id: qrId });
            Alert.alert("Sucesso", "QR Code excluído.");
          } catch (e: any) {
            Alert.alert("Erro", e.message || "Erro ao excluir");
          }
        },
      },
    ]);
  };

  const handleDeleteBatchFree = (batchId: Id<"qrBatches">) => {
    Alert.alert(
      "Excluir livres do lote",
      "Deseja excluir todos os QR Codes livres deste lote?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            try {
              await removeMany({ batchId });
              Alert.alert("Sucesso", "QR Codes livres excluídos.");
            } catch (e: any) {
              Alert.alert("Erro", e.message || "Erro ao excluir");
            }
          },
        },
      ]
    );
  };

  const handleShareToken = async (token: string) => {
    try {
      await Share.share({ message: token });
    } catch {}
  };

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-2xl font-bold text-foreground">
            QR Codes
          </Text>
          <Text className="text-muted-foreground text-sm">
            Gerencie QR Codes e lotes
          </Text>
        </View>
        <Button onPress={() => router.push("/(drawer)/qr-codes" as any)}>
          <ButtonText>+ Gerar</ButtonText>
        </Button>
      </View>

      {/* Stats Cards */}
      <View className="flex-row flex-wrap gap-3">
        <StatCard
          icon={<Package size={18} color="#3b82f6" />}
          label="Equipamentos"
          value={`${totalEquipment}`}
          sub={`${operationalCount} operacional`}
        />
        <StatCard
          icon={<QrCode size={18} color="#8b5cf6" />}
          label="Total QR Codes"
          value={stats?.total?.toString() ?? "—"}
        />
        <StatCard
          icon={<Link2 size={18} color="#10b981" />}
          label="Vinculados"
          value={stats?.linked?.toString() ?? "—"}
        />
        <StatCard
          icon={<Hash size={18} color="#f59e0b" />}
          label="Livres"
          value={stats?.free?.toString() ?? "—"}
        />
      </View>

      {/* Recent Batches */}
      <Card>
        <CardHeader>
          <CardTitle>Lotes Recentes</CardTitle>
          <CardDescription>Últimos lotes de QR Codes gerados</CardDescription>
        </CardHeader>
        <CardContent>
          {!batches ? (
            <ActivityIndicator />
          ) : batches.length === 0 ? (
            <Text className="text-muted-foreground text-sm">
              Nenhum lote encontrado
            </Text>
          ) : (
            <View className="gap-2">
              {batches.map((batch: any) => (
                <Pressable
                  key={batch._id}
                  onPress={() =>
                    setActiveBatchId(
                      activeBatchId === batch._id ? null : batch._id
                    )
                  }
                  className="flex-row items-center justify-between rounded-lg border border-border p-3"
                >
                  <View className="flex-1">
                    <Text className="text-foreground font-medium text-sm">
                      {batch.name}
                    </Text>
                    <Text className="text-muted-foreground text-xs mt-0.5">
                      {batch.count} código(s) •{" "}
                      {new Date(batch.createdAt).toLocaleDateString("pt-BR")}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onPress={() => setActiveBatchId(batch._id)}
                    >
                      <ButtonText variant="outline">Abrir lote</ButtonText>
                    </Button>
                    <ChevronRight size={16} color="#9ca3af" />
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </CardContent>
      </Card>

      {/* Batch Viewer */}
      {activeBatchId && (
        <BatchViewer
          batchId={activeBatchId}
          batchName={activeBatch?.name ?? "Lote"}
          onClose={() => setActiveBatchId(null)}
          onDeleteQR={handleDeleteQR}
          onDeleteBatchFree={handleDeleteBatchFree}
          onShareToken={handleShareToken}
        />
      )}

      {/* Search */}
      <Card>
        <CardHeader>
          <View className="flex-row items-center gap-2">
            <Search size={18} color="#6d5efc" />
            <CardTitle>Buscar</CardTitle>
          </View>
          <CardDescription>
            Pesquise por código ou nome de lote
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-3">
          <Input
            value={searchTerm}
            onChangeText={setSearchTerm}
            placeholder="Código ou nome do lote..."
          />
          {searchTerm.trim().length >= 2 && (
            <SearchResults
              results={searchResults}
              onSelectBatch={(id) => setActiveBatchId(id)}
              onDeleteQR={handleDeleteQR}
              onShareToken={handleShareToken}
            />
          )}
        </CardContent>
      </Card>
    </View>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card className="flex-1 min-w-[140px] p-3">
      <View className="flex-row items-center gap-2 mb-1">{icon}
        <Text className="text-xs text-muted-foreground">{label}</Text>
      </View>
      <Text className="text-xl font-bold text-foreground">{value}</Text>
      {sub && (
        <Text className="text-xs text-muted-foreground mt-0.5">{sub}</Text>
      )}
    </Card>
  );
}

function BatchViewer({
  batchId,
  batchName,
  onClose,
  onDeleteQR,
  onDeleteBatchFree,
  onShareToken,
}: {
  batchId: Id<"qrBatches">;
  batchName: string;
  onClose: () => void;
  onDeleteQR: (id: Id<"qrCodes">, isLinked: boolean) => void;
  onDeleteBatchFree: (id: Id<"qrBatches">) => void;
  onShareToken: (token: string) => void;
}) {
  const batchCodes = usePaginatedQuery(
    api.qrCodes.listByBatch,
    { batchId },
    { initialNumItems: 25 }
  );

  return (
    <Card>
      <CardHeader>
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <CardTitle>{batchName}</CardTitle>
            <CardDescription>
              {batchCodes.results.length} código(s) carregado(s)
            </CardDescription>
          </View>
          <View className="flex-row gap-2">
            <Button
              variant="destructive"
              size="sm"
              onPress={() => onDeleteBatchFree(batchId)}
            >
              <View className="flex-row items-center gap-1">
                <Trash2 size={14} color="#fff" />
                <ButtonText>Excluir livres</ButtonText>
              </View>
            </Button>
            <Pressable onPress={onClose} className="p-2">
              <X size={18} color="#9ca3af" />
            </Pressable>
          </View>
        </View>
      </CardHeader>
      <CardContent>
        {batchCodes.status === "LoadingFirstPage" ? (
          <ActivityIndicator />
        ) : batchCodes.results.length === 0 ? (
          <Text className="text-muted-foreground text-sm">
            Nenhum código neste lote
          </Text>
        ) : (
          <View className="gap-2">
            {batchCodes.results.map((qr: any) => (
              <QRCodeRow
                key={qr._id}
                qr={qr}
                onDelete={onDeleteQR}
                onShare={onShareToken}
              />
            ))}
            {(batchCodes.status === "CanLoadMore" ||
              batchCodes.status === "LoadingMore") && (
              <Button
                variant="outline"
                onPress={() => batchCodes.loadMore(25)}
                disabled={batchCodes.status === "LoadingMore"}
              >
                {batchCodes.status === "LoadingMore" ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <ButtonText variant="outline">Carregar mais</ButtonText>
                )}
              </Button>
            )}
          </View>
        )}
      </CardContent>
    </Card>
  );
}

function QRCodeRow({
  qr,
  onDelete,
  onShare,
}: {
  qr: any;
  onDelete: (id: Id<"qrCodes">, isLinked: boolean) => void;
  onShare: (token: string) => void;
}) {
  const isLinked = !!qr.equipmentId;
  return (
    <View className="flex-row items-center justify-between rounded-lg border border-border p-3">
      <Pressable onPress={() => onShare(qr.token)} className="flex-1">
        <Text
          className="text-foreground text-sm"
          style={{ fontFamily: "monospace" }}
        >
          {qr.token}
        </Text>
        <View className="flex-row items-center gap-2 mt-1">
          <Badge variant={isLinked ? "success" : "outline"}>
            {isLinked ? "Vinculado" : "Livre"}
          </Badge>
          {qr.batchName && (
            <Text className="text-xs text-muted-foreground">
              {qr.batchName}
            </Text>
          )}
        </View>
      </Pressable>
      {!isLinked && (
        <Pressable
          onPress={() => onDelete(qr._id, isLinked)}
          className="p-2 ml-2"
        >
          <Trash2 size={16} color="#ef4444" />
        </Pressable>
      )}
    </View>
  );
}

function SearchResults({
  results,
  onSelectBatch,
  onDeleteQR,
  onShareToken,
}: {
  results: any;
  onSelectBatch: (id: Id<"qrBatches">) => void;
  onDeleteQR: (id: Id<"qrCodes">, isLinked: boolean) => void;
  onShareToken: (token: string) => void;
}) {
  if (!results) return <ActivityIndicator />;

  const hasBatches = results.batches?.length > 0;
  const hasCodes = results.codes?.length > 0;

  if (!hasBatches && !hasCodes) {
    return (
      <Text className="text-muted-foreground text-sm">
        Nenhum resultado encontrado
      </Text>
    );
  }

  return (
    <View className="gap-3">
      {hasBatches && (
        <View className="gap-2">
          <Text className="text-foreground font-semibold text-sm">Lotes</Text>
          {results.batches.map((batch: any) => (
            <Pressable
              key={batch._id}
              onPress={() => onSelectBatch(batch._id)}
              className="flex-row items-center justify-between rounded-lg border border-border p-3"
            >
              <View className="flex-1">
                <Text className="text-foreground font-medium text-sm">
                  {batch.name}
                </Text>
                <Text className="text-muted-foreground text-xs">
                  {batch.count} código(s)
                </Text>
              </View>
              <ChevronRight size={16} color="#9ca3af" />
            </Pressable>
          ))}
        </View>
      )}
      {hasCodes && (
        <View className="gap-2">
          <Text className="text-foreground font-semibold text-sm">
            QR Codes
          </Text>
          {results.codes.map((qr: any) => (
            <QRCodeRow
              key={qr._id}
              qr={qr}
              onDelete={onDeleteQR}
              onShare={onShareToken}
            />
          ))}
        </View>
      )}
    </View>
  );
}
