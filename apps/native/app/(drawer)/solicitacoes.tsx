import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useMutation,
  useQuery,
} from "convex/react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Lock,
  Send,
  X,
} from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  View,
} from "react-native";
import { Link } from "expo-router";
import {
  formatDate,
  MATERIAL_REQUEST_STATUS_LABELS,
  MATERIAL_REQUEST_STATUS_VARIANTS,
  URGENCY_LABELS,
  URGENCY_VARIANTS,
} from "@rlpapp/shared";

import { Container } from "@/components/container";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonText } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/errors";

type RequestStatus = "Pendente" | "Aprovado" | "Rejeitado" | "Convertido";
type MaterialRequest = FunctionReturnType<
  typeof api.materialRequests.list
>[number];

const REVIEWER_ROLES = ["admin", "manager", "director"];

export default function SolicitacoesScreen() {
  return (
    <Container className="px-5 pt-4 pb-24">
      <Authenticated>
        <SolicitacoesContent />
      </Authenticated>
      <Unauthenticated>
        <Card className="p-6 items-center">
          <Lock size={48} color="#888" />
          <Text className="text-foreground font-medium mt-4">
            Acesso Restrito
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
  const currentUser = useQuery(api.users.getCurrentUser);
  const [statusFilter, setStatusFilter] = useState<RequestStatus>("Pendente");
  const requests = useQuery(api.materialRequests.list, {
    status: statusFilter,
  });
  const pendingCount = useQuery(api.materialRequests.pendingCount);

  const canReview =
    currentUser != null && REVIEWER_ROLES.includes(currentUser.role);

  return (
    <View className="gap-4">
      <View>
        <Text className="text-2xl font-bold text-foreground">
          Solicitações de Material
        </Text>
        <Text className="text-muted-foreground text-sm">
          {pendingCount != null && pendingCount > 0
            ? `${pendingCount} pendente(s) de aprovação`
            : "Revisão e aprovação de pedidos"}
        </Text>
      </View>

      <View className="flex-row gap-1 border-b border-border">
        {(
          ["Pendente", "Aprovado", "Rejeitado", "Convertido"] as const
        ).map((status) => (
          <Pressable
            key={status}
            onPress={() => setStatusFilter(status)}
            className={`px-3 py-2 border-b-2 ${
              statusFilter === status
                ? "border-blue-500"
                : "border-transparent"
            }`}
          >
            <Text
              className={`text-sm font-medium ${
                statusFilter === status
                  ? "text-blue-500"
                  : "text-muted-foreground"
              }`}
            >
              {MATERIAL_REQUEST_STATUS_LABELS[status] ?? status}
            </Text>
          </Pressable>
        ))}
      </View>

      {!requests ? (
        <ActivityIndicator />
      ) : requests.length === 0 ? (
        <Card className="p-6 items-center">
          <ClipboardList size={32} color="#94a3b8" />
          <Text className="text-muted-foreground mt-2">
            Nenhuma solicitação{" "}
            {MATERIAL_REQUEST_STATUS_LABELS[statusFilter]?.toLowerCase()}
          </Text>
        </Card>
      ) : (
        <View className="gap-3">
          {requests.map((request) => (
            <RequestCard
              key={request._id}
              request={request}
              canReview={canReview}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function RequestCard({
  request,
  canReview,
}: {
  request: MaterialRequest;
  canReview: boolean;
}) {
  const approve = useMutation(api.materialRequests.approve);
  const reject = useMutation(api.materialRequests.reject);
  const convertToShipment = useMutation(api.materialRequests.convertToShipment);

  const [expanded, setExpanded] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      await approve({
        requestId: request._id,
        reviewNotes: reviewNotes.trim() || undefined,
      });
      Alert.alert("Sucesso", "Solicitação aprovada");
    } catch (error) {
      Alert.alert("Erro", getErrorMessage(error, "Erro ao aprovar"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!reviewNotes.trim()) {
      Alert.alert("Erro", "Informe o motivo da rejeição");
      return;
    }
    setSubmitting(true);
    try {
      await reject({ requestId: request._id, reviewNotes: reviewNotes.trim() });
      Alert.alert("Sucesso", "Solicitação rejeitada");
    } catch (error) {
      Alert.alert("Erro", getErrorMessage(error, "Erro ao rejeitar"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConvert = async () => {
    setSubmitting(true);
    try {
      await convertToShipment({ requestId: request._id });
      Alert.alert("Sucesso", "Remessa criada a partir da solicitação");
    } catch (error) {
      Alert.alert("Erro", getErrorMessage(error, "Erro ao converter"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <Pressable onPress={() => setExpanded((e) => !e)}>
        <CardHeader>
          <View className="flex-row items-center gap-2">
            {expanded ? (
              <ChevronDown size={16} color="#666" />
            ) : (
              <ChevronRight size={16} color="#666" />
            )}
            <View className="flex-1">
              <CardTitle>{request.site?.name ?? "Site removido"}</CardTitle>
              <CardDescription>
                Por {request.requesterName} • até {formatDate(request.dateNeeded)}
              </CardDescription>
            </View>
            <View className="items-end gap-1">
              <Badge
                variant={
                  MATERIAL_REQUEST_STATUS_VARIANTS[request.status] ?? "outline"
                }
              >
                {MATERIAL_REQUEST_STATUS_LABELS[request.status] ??
                  request.status}
              </Badge>
              <Badge variant={URGENCY_VARIANTS[request.urgency] ?? "outline"}>
                {URGENCY_LABELS[request.urgency] ?? request.urgency}
              </Badge>
            </View>
          </View>
        </CardHeader>
      </Pressable>

      {expanded && (
        <CardContent className="gap-3">
          <Text className="text-sm text-foreground">
            <Text className="font-medium">Motivo: </Text>
            {request.reason}
          </Text>

          <View className="gap-1 border border-border rounded-lg p-3">
            {request.lines.map((line) => (
              <View key={line._id} className="flex-row justify-between">
                <Text className="text-sm text-foreground flex-1">
                  {line.product?.name ?? "Produto removido"}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  {line.qty} {line.product?.unit ?? "un"}
                  {line.approvedQty != null && line.approvedQty !== line.qty
                    ? ` → ${line.approvedQty}`
                    : ""}
                </Text>
              </View>
            ))}
          </View>

          {request.reviewNotes && (
            <Text className="text-sm text-foreground">
              <Text className="font-medium">Resposta: </Text>
              {request.reviewNotes}
            </Text>
          )}
          {request.reviewerName && (
            <Text className="text-xs text-muted-foreground">
              Revisado por {request.reviewerName}
            </Text>
          )}

          {canReview && request.status === "Pendente" && (
            <View className="gap-2">
              <View className="gap-1">
                <Label>Observações da revisão</Label>
                <Input
                  value={reviewNotes}
                  onChangeText={setReviewNotes}
                  placeholder="Opcional para aprovar, obrigatório para rejeitar"
                  multiline
                />
              </View>
              <View className="flex-row gap-2">
                <Button
                  className="flex-1"
                  onPress={handleApprove}
                  disabled={submitting}
                >
                  <View className="flex-row items-center gap-1">
                    <Check size={14} color="#fff" />
                    <ButtonText>Aprovar</ButtonText>
                  </View>
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onPress={handleReject}
                  disabled={submitting}
                >
                  <View className="flex-row items-center gap-1">
                    <X size={14} color="#fff" />
                    <ButtonText>Rejeitar</ButtonText>
                  </View>
                </Button>
              </View>
            </View>
          )}

          {canReview && request.status === "Aprovado" && (
            <Button onPress={handleConvert} disabled={submitting}>
              <View className="flex-row items-center gap-1">
                <Send size={14} color="#fff" />
                <ButtonText>Converter em Remessa</ButtonText>
              </View>
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}
