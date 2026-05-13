import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useMutation,
  useQuery,
} from "convex/react";
import { Link } from "expo-router";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Lock,
  PackageCheck,
  X,
} from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { Container } from "@/components/container";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonText } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const STATUS_LABELS: Record<string, string> = {
  Pendente: "Pendente",
  Aprovado: "Aprovado",
  Rejeitado: "Rejeitado",
  Convertido: "Convertido",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  Pendente: "outline",
  Aprovado: "default",
  Rejeitado: "destructive",
  Convertido: "secondary",
};

const URGENCY_LABELS: Record<string, string> = {
  normal: "Normal",
  urgente: "Urgente",
  critico: "Crítico",
};

const URGENCY_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  normal: "outline",
  urgente: "secondary",
  critico: "destructive",
};

const STATUS_OPTIONS = [
  { label: "Todos", value: "" },
  { label: "Pendente", value: "Pendente" },
  { label: "Aprovado", value: "Aprovado" },
  { label: "Rejeitado", value: "Rejeitado" },
  { label: "Convertido", value: "Convertido" },
];

export default function SolicitacoesScreen() {
  return (
    <Container className="px-5 pt-4 pb-24">
      <View className="py-4 mb-4">
        <Text className="text-2xl font-semibold text-foreground tracking-tight">
          Solicitações de Material
        </Text>
        <Text className="text-muted-foreground text-sm mt-1">
          Gerencie as solicitações enviadas pelos operadores
        </Text>
      </View>

      <Authenticated>
        <SolicitacoesContent />
      </Authenticated>
      <Unauthenticated>
        <Card className="p-6 items-center">
          <Lock size={48} color="#888" />
          <Text className="text-foreground font-medium mt-4">Acesso Restrito</Text>
          <Text className="text-muted-foreground text-sm text-center mt-2">
            Faça login para acessar as solicitações
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

function SolicitacoesContent() {
  const [statusFilter, setStatusFilter] = useState("");
  const requests = useQuery(
    api.materialRequests.list,
    statusFilter ? { status: statusFilter } : {},
  );

  const approveMutation = useMutation(api.materialRequests.approve);
  const rejectMutation = useMutation(api.materialRequests.reject);
  const convertMutation = useMutation(api.materialRequests.convertToShipment);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [approveDialog, setApproveDialog] = useState<any | null>(null);
  const [rejectDialog, setRejectDialog] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approveNotes, setApproveNotes] = useState("");
  const [lineEdits, setLineEdits] = useState<{ lineId: string; approvedQty: number }[]>([]);

  const openApproveDialog = (request: any) => {
    setApproveDialog(request);
    setApproveNotes("");
    setLineEdits(
      request.lines.map((l: any) => ({
        lineId: l._id,
        approvedQty: l.qty,
      })),
    );
  };

  const handleApprove = async () => {
    if (!approveDialog) return;
    try {
      await approveMutation({
        requestId: approveDialog._id as Id<"materialRequests">,
        reviewNotes: approveNotes || undefined,
        lineEdits: lineEdits.map((e) => ({
          lineId: e.lineId as Id<"materialRequestLines">,
          approvedQty: e.approvedQty,
        })),
      });
      Alert.alert("Sucesso", "Solicitação aprovada");
      setApproveDialog(null);
    } catch (error: any) {
      Alert.alert("Erro", error.message || "Erro ao aprovar");
    }
  };

  const handleReject = async () => {
    if (!rejectDialog) return;
    if (!rejectReason.trim()) {
      Alert.alert("Atenção", "Informe o motivo da rejeição");
      return;
    }
    try {
      await rejectMutation({
        requestId: rejectDialog._id as Id<"materialRequests">,
        reviewNotes: rejectReason,
      });
      Alert.alert("Sucesso", "Solicitação rejeitada");
      setRejectDialog(null);
      setRejectReason("");
    } catch (error: any) {
      Alert.alert("Erro", error.message || "Erro ao rejeitar");
    }
  };

  const handleConvert = (requestId: string) => {
    Alert.alert(
      "Converter em Remessa",
      "Converter esta solicitação em remessa? O estoque será deduzido imediatamente.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Converter",
          onPress: async () => {
            try {
              await convertMutation({
                requestId: requestId as Id<"materialRequests">,
              });
              Alert.alert("Sucesso", "Remessa criada com sucesso");
            } catch (error: any) {
              Alert.alert("Erro", error.message || "Erro ao converter em remessa");
            }
          },
        },
      ],
    );
  };

  const formatDate = (timestamp: number) =>
    new Date(timestamp).toLocaleDateString("pt-BR");

  if (!requests) {
    return (
      <View className="flex-1 items-center justify-center py-8">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View className="gap-4">
        <View className="gap-2">
          <Label className="text-xs">Filtrar por status</Label>
          <Select
            value={statusFilter}
            onValueChange={setStatusFilter}
            options={STATUS_OPTIONS}
            placeholder="Todos"
          />
        </View>

        <Card className="rounded-2xl p-4">
          <CardHeader>
            <View className="flex-row items-center gap-2">
              <ClipboardList size={20} color="#3478f6" />
              <CardTitle>Solicitações</CardTitle>
            </View>
            <CardDescription>
              {`${requests.length} solicitação(ões)`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {requests.length === 0 ? (
              <Text className="text-muted-foreground text-sm">
                Nenhuma solicitação encontrada
              </Text>
            ) : (
              <View className="gap-3">
                {requests.map((req: any) => (
                  <View key={req._id}>
                    <Pressable
                      onPress={() =>
                        setExpandedId(expandedId === req._id ? null : req._id)
                      }
                    >
                      <Card className="rounded-xl p-3 bg-secondary">
                        <View className="flex-row items-center gap-2 mb-2">
                          {expandedId === req._id ? (
                            <ChevronDown size={16} className="text-muted-foreground" />
                          ) : (
                            <ChevronRight size={16} className="text-muted-foreground" />
                          )}
                          <Badge variant={STATUS_VARIANTS[req.status] ?? "outline"}>
                            {STATUS_LABELS[req.status] ?? req.status}
                          </Badge>
                          <Badge variant={URGENCY_VARIANTS[req.urgency] ?? "outline"}>
                            {URGENCY_LABELS[req.urgency] ?? req.urgency}
                          </Badge>
                        </View>
                        <View className="ml-6">
                          <Text className="text-foreground font-medium">
                            {req.requesterName}
                          </Text>
                          <Text className="text-muted-foreground text-xs mt-1">
                            {req.site?.name ?? "—"} • Necessário até{" "}
                            {formatDate(req.dateNeeded)}
                          </Text>
                          <Text className="text-muted-foreground text-xs mt-1">
                            Criado em {formatDate(req.createdAt)}
                          </Text>
                        </View>

                        <View className="flex-row gap-2 ml-6 mt-3">
                          {req.status === "Pendente" && (
                            <>
                              <Button
                                size="sm"
                                onPress={() => openApproveDialog(req)}
                              >
                                <Check size={14} color="#fff" />
                                <ButtonText className="ml-1">Aprovar</ButtonText>
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onPress={() => {
                                  setRejectDialog(req);
                                  setRejectReason("");
                                }}
                              >
                                <X size={14} color="#fff" />
                                <ButtonText variant="destructive" className="ml-1">
                                  Rejeitar
                                </ButtonText>
                              </Button>
                            </>
                          )}
                          {req.status === "Aprovado" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onPress={() => handleConvert(req._id)}
                            >
                              <PackageCheck size={14} className="text-foreground" />
                              <ButtonText variant="outline" className="ml-1">
                                Converter em Remessa
                              </ButtonText>
                            </Button>
                          )}
                        </View>
                      </Card>
                    </Pressable>

                    {expandedId === req._id && (
                      <Card className="rounded-b-xl p-3 -mt-1 bg-secondary/50">
                        <View className="gap-3">
                          <View>
                            <Text className="text-sm font-medium text-foreground">
                              Motivo:
                            </Text>
                            <Text className="text-sm text-muted-foreground">
                              {req.reason}
                            </Text>
                          </View>
                          {req.reviewNotes && (
                            <View>
                              <Text className="text-sm font-medium text-foreground">
                                Notas da revisão ({req.reviewerName}):
                              </Text>
                              <Text className="text-sm text-muted-foreground">
                                {req.reviewNotes}
                              </Text>
                            </View>
                          )}
                          <View>
                            <Text className="text-sm font-medium text-foreground mb-2">
                              Produtos:
                            </Text>
                            {req.lines.map((line: any) => (
                              <View
                                key={line._id}
                                className="flex-row items-center justify-between py-2 border-b border-border"
                              >
                                <Text className="text-sm text-foreground font-medium flex-1">
                                  {line.product?.name ?? "Produto removido"}
                                </Text>
                                <View className="items-end">
                                  <Text className="text-xs text-muted-foreground">
                                    Solicitado: {line.qty} {line.product?.unit}
                                  </Text>
                                  {line.approvedQty != null && (
                                    <Text className="text-xs text-muted-foreground">
                                      Aprovado: {line.approvedQty} {line.product?.unit}
                                    </Text>
                                  )}
                                </View>
                              </View>
                            ))}
                          </View>
                        </View>
                      </Card>
                    )}
                  </View>
                ))}
              </View>
            )}
          </CardContent>
        </Card>
      </View>

      <Dialog open={!!approveDialog} onOpenChange={(open) => !open && setApproveDialog(null)}>
        <DialogHeader>
          <DialogTitle>Aprovar Solicitação</DialogTitle>
          <DialogDescription>
            Revise e edite as quantidades antes de aprovar
          </DialogDescription>
        </DialogHeader>
        {approveDialog && (
          <View className="gap-4">
            <View className="gap-1">
              <Text className="text-sm text-foreground">
                <Text className="font-medium">Solicitante:</Text>{" "}
                {approveDialog.requesterName}
              </Text>
              <Text className="text-sm text-foreground">
                <Text className="font-medium">Motivo:</Text>{" "}
                {approveDialog.reason}
              </Text>
            </View>
            <View className="gap-3">
              {approveDialog.lines.map((line: any, idx: number) => (
                <View key={line._id} className="gap-1">
                  <Text className="text-sm font-medium text-foreground">
                    {line.product?.name}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    Solicitado: {line.qty} {line.product?.unit}
                  </Text>
                  <View className="flex-row items-center gap-2">
                    <Label className="text-xs">Aprovar:</Label>
                    <Input
                      className="flex-1"
                      keyboardType="numeric"
                      value={String(lineEdits[idx]?.approvedQty ?? line.qty)}
                      onChangeText={(text) => {
                        const val = Number(text) || 0;
                        setLineEdits((prev) =>
                          prev.map((le, i) =>
                            i === idx ? { ...le, approvedQty: val } : le,
                          ),
                        );
                      }}
                    />
                  </View>
                </View>
              ))}
            </View>
            <View className="gap-1">
              <Label className="text-xs">Observações (opcional)</Label>
              <Input
                value={approveNotes}
                onChangeText={setApproveNotes}
                placeholder="Notas da aprovação"
              />
            </View>
          </View>
        )}
        <DialogFooter>
          <Button variant="outline" onPress={() => setApproveDialog(null)}>
            <ButtonText variant="outline">Cancelar</ButtonText>
          </Button>
          <Button onPress={handleApprove}>
            <ButtonText>Confirmar Aprovação</ButtonText>
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={!!rejectDialog} onOpenChange={(open) => !open && setRejectDialog(null)}>
        <DialogHeader>
          <DialogTitle>Rejeitar Solicitação</DialogTitle>
          <DialogDescription>
            Informe o motivo da rejeição
          </DialogDescription>
        </DialogHeader>
        <View className="gap-2">
          <Label>Motivo da rejeição</Label>
          <Input
            value={rejectReason}
            onChangeText={setRejectReason}
            placeholder="Explique o motivo"
          />
        </View>
        <DialogFooter>
          <Button variant="outline" onPress={() => setRejectDialog(null)}>
            <ButtonText variant="outline">Cancelar</ButtonText>
          </Button>
          <Button variant="destructive" onPress={handleReject}>
            <ButtonText variant="destructive">Confirmar Rejeição</ButtonText>
          </Button>
        </DialogFooter>
      </Dialog>

      <View className="h-24" />
    </ScrollView>
  );
}
