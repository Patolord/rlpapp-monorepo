import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useQuery,
  useMutation,
} from "convex/react";
import {
  ScanLine,
  Send,
  ClipboardList,
  Check,
  PackageCheck,
  Plus,
  XCircle,
  Lock,
  ChevronDown,
  ChevronRight,
} from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Link } from "expo-router";

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
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { getErrorMessage } from "@/lib/errors";
import { formatDateTime } from "@rlpapp/shared";

// Payload do QR gerado em shipments.createShipment
type ScannedShipment = {
  shipmentId: string;
  toSiteId: string;
  siteName: string;
  products: { name: string; qty: number; unit: string }[];
  createdAt: number;
};

export default function OperadorScreen() {
  return (
    <Container className="px-5 pt-4 pb-24">
      <Authenticated>
        <OperadorContent />
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

type Tab = "receber" | "enviar" | "solicitar";

function OperadorContent() {
  const [activeTab, setActiveTab] = useState<Tab>("receber");

  return (
    <View className="gap-4">
      <View>
        <Text className="text-2xl font-bold text-foreground">
          Painel do Operador
        </Text>
        <Text className="text-muted-foreground text-sm">
          Receba, envie e solicite materiais
        </Text>
      </View>

      <View className="flex-row gap-1 border-b border-border">
        {(
          [
            { key: "receber", label: "Receber", Icon: ScanLine },
            { key: "enviar", label: "Enviar", Icon: Send },
            { key: "solicitar", label: "Solicitar", Icon: ClipboardList },
          ] as const
        ).map(({ key, label, Icon }) => (
          <Pressable
            key={key}
            onPress={() => setActiveTab(key)}
            className={`flex-row items-center gap-1.5 px-3 py-2 border-b-2 ${
              activeTab === key
                ? "border-blue-500"
                : "border-transparent"
            }`}
          >
            <Icon
              size={16}
              color={activeTab === key ? "#3b82f6" : "#94a3b8"}
            />
            <Text
              className={`text-sm font-medium ${
                activeTab === key
                  ? "text-blue-500"
                  : "text-muted-foreground"
              }`}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeTab === "receber" && <ReceberTab />}
      {activeTab === "enviar" && <EnviarTab />}
      {activeTab === "solicitar" && <SolicitarTab />}
    </View>
  );
}

function ReceberTab() {
  const pendingShipments = useQuery(api.shipments.listByStatus, {
    status: "PendingShipment",
  });
  const sites = useQuery(api.sites.list, { onlyActive: true });
  const confirmFromQR = useMutation(api.deliveryConfirmations.confirmFromQR);

  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [scannedData, setScannedData] = useState<ScannedShipment | null>(null);
  const [receiverName, setReceiverName] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [confirmNotes, setConfirmNotes] = useState("");

  const siteOptions = (sites ?? []).map((s) => ({
    label: s.name,
    value: s._id,
  }));

  const startScanner = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert("Permissão negada", "Acesso à câmera é necessário");
        return;
      }
    }
    setScanning(true);
  };

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.shipmentId) {
        setScannedData(parsed);
        setScanning(false);
      }
    } catch {
      Alert.alert("Erro", "QR Code inválido");
    }
  };

  const handleConfirm = async () => {
    if (!scannedData) return;
    if (!selectedSiteId) {
      Alert.alert("Erro", "Selecione o site onde está recebendo");
      return;
    }
    if (!receiverName.trim()) {
      Alert.alert("Erro", "Informe o nome de quem está recebendo");
      return;
    }
    try {
      await confirmFromQR({
        shipmentId: scannedData.shipmentId as Id<"shipments">,
        receivedAtSiteId: selectedSiteId as Id<"sites">,
        receiverName: receiverName.trim(),
        notes: confirmNotes || undefined,
      });
      Alert.alert("Sucesso", "Entrega confirmada");
      setScannedData(null);
      setReceiverName("");
      setSelectedSiteId("");
      setConfirmNotes("");
    } catch (error) {
      Alert.alert("Erro", getErrorMessage(error, "Erro ao confirmar entrega"));
    }
  };

  return (
    <View className="gap-4">
      <Card>
        <CardHeader>
          <View className="flex-row items-center gap-2">
            <ScanLine size={20} color="#6d5efc" />
            <CardTitle>Escanear QR Code</CardTitle>
          </View>
          <CardDescription>
            Escaneie o QR Code junto com os materiais
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!scanning && !scannedData && (
            <Button onPress={startScanner}>
              <View className="flex-row items-center gap-1">
                <ScanLine size={16} color="#fff" />
                <ButtonText>Abrir Câmera</ButtonText>
              </View>
            </Button>
          )}

          {scanning && (
            <View className="gap-2">
              <View className="w-full h-72 rounded-lg overflow-hidden">
                <CameraView
                  style={{ flex: 1 }}
                  facing="back"
                  barcodeScannerSettings={{
                    barcodeTypes: ["qr"],
                  }}
                  onBarcodeScanned={handleBarCodeScanned}
                />
              </View>
              <Button variant="outline" onPress={() => setScanning(false)}>
                <ButtonText variant="outline">Cancelar</ButtonText>
              </Button>
            </View>
          )}

          {scannedData && (
            <View className="gap-3 border border-border rounded-lg p-3">
              <Text className="text-foreground font-semibold">
                Dados da Remessa
              </Text>
              <Text className="text-sm text-muted-foreground">
                Destino: {scannedData.siteName}
              </Text>
              {scannedData.products?.map((p, i) => (
                <View
                  key={i}
                  className="flex-row justify-between"
                >
                  <Text className="text-sm text-foreground">
                    {p.name}
                  </Text>
                  <Text className="text-sm text-muted-foreground">
                    {p.qty} {p.unit}
                  </Text>
                </View>
              ))}

              <View className="gap-1">
                <Label>Site onde está recebendo</Label>
                <Select
                  value={selectedSiteId}
                  onValueChange={setSelectedSiteId}
                  options={siteOptions}
                  placeholder="Selecione o site"
                />
              </View>
              <View className="gap-1">
                <Label>Nome de quem recebe</Label>
                <Input
                  value={receiverName}
                  onChangeText={setReceiverName}
                  placeholder="Nome completo"
                />
              </View>
              <View className="gap-1">
                <Label>Observações (opcional)</Label>
                <Input
                  value={confirmNotes}
                  onChangeText={setConfirmNotes}
                  placeholder="Notas"
                />
              </View>
              <View className="flex-row gap-2">
                <Button onPress={handleConfirm} className="flex-1">
                  <View className="flex-row items-center gap-1">
                    <Check size={14} color="#fff" />
                    <ButtonText>Confirmar</ButtonText>
                  </View>
                </Button>
                <Button
                  variant="outline"
                  onPress={() => setScannedData(null)}
                >
                  <ButtonText variant="outline">Cancelar</ButtonText>
                </Button>
              </View>
            </View>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Remessas Pendentes</CardTitle>
          <CardDescription>Aguardando confirmação de entrega</CardDescription>
        </CardHeader>
        <CardContent>
          {!pendingShipments ? (
            <ActivityIndicator />
          ) : pendingShipments.length === 0 ? (
            <Text className="text-muted-foreground">Nenhuma pendente</Text>
          ) : (
            <View className="gap-2">
              {pendingShipments.map((s) => (
                <View
                  key={s._id}
                  className="flex-row items-center justify-between rounded-lg border border-border p-3"
                >
                  <View className="flex-1">
                    <Text className="text-foreground font-medium text-sm">
                      {s.site?.name ?? "—"}
                    </Text>
                    <Text className="text-muted-foreground text-xs">
                      {s.lines.length} produto(s) •{" "}
                      {formatDateTime(s.createdAt)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </CardContent>
      </Card>
    </View>
  );
}

function EnviarTab() {
  const readyShipments = useQuery(api.shipments.listByStatus, {
    status: "RegisteredOut",
  });
  const stageShipment = useMutation(api.shipments.stageShipment);

  const handleStage = async (shipmentId: Id<"shipments">) => {
    try {
      await stageShipment({ shipmentId });
    } catch (error) {
      Alert.alert("Erro", getErrorMessage(error, "Erro ao preparar remessa"));
    }
  };

  return (
    <View className="gap-4">
      <Card>
        <CardHeader>
          <View className="flex-row items-center gap-2">
            <Send size={20} color="#6d5efc" />
            <CardTitle>Prontas para Envio</CardTitle>
          </View>
          <CardDescription>
            Remessas com saída registrada, prontas para preparar
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!readyShipments ? (
            <ActivityIndicator />
          ) : readyShipments.length === 0 ? (
            <Text className="text-muted-foreground">
              Nenhuma remessa pronta
            </Text>
          ) : (
            <View className="gap-2">
              {readyShipments.map((s) => (
                <View
                  key={s._id}
                  className="flex-row items-center justify-between rounded-lg border border-border p-3"
                >
                  <View className="flex-1">
                    <Text className="text-foreground font-medium text-sm">
                      {s.site?.name ?? "—"}
                    </Text>
                    <Text className="text-muted-foreground text-xs">
                      {s.lines.length} produto(s) •{" "}
                      {formatDateTime(s.createdAt)}
                    </Text>
                  </View>
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={() => handleStage(s._id)}
                  >
                    <View className="flex-row items-center gap-1">
                      <PackageCheck size={14} color="#666" />
                      <ButtonText variant="outline">Preparar</ButtonText>
                    </View>
                  </Button>
                </View>
              ))}
            </View>
          )}
        </CardContent>
      </Card>
    </View>
  );
}

function SolicitarTab() {
  const products = useQuery(api.products.list, { onlyActive: true });
  const sites = useQuery(api.sites.list, { onlyActive: true });
  const myRequests = useQuery(api.materialRequests.listByUser);
  const createRequest = useMutation(api.materialRequests.create);

  const [form, setForm] = useState({
    siteId: "",
    reason: "",
    urgency: "normal" as "normal" | "urgente" | "critico",
    dateNeeded: "",
    lines: [{ productId: "", qty: "1" }] as {
      productId: string;
      qty: string;
    }[],
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const resetForm = () => {
    setForm({
      siteId: "",
      reason: "",
      urgency: "normal",
      dateNeeded: "",
      lines: [{ productId: "", qty: "1" }],
    });
  };

  const siteOptions = (sites ?? []).map((s) => ({
    label: s.name,
    value: s._id,
  }));
  const productOptions = (products ?? []).map((p) => ({
    label: `${p.name} (${p.unit})`,
    value: p._id,
  }));
  const urgencyOptions = [
    { label: "Normal", value: "normal" },
    { label: "Urgente", value: "urgente" },
    { label: "Crítico", value: "critico" },
  ];

  const addLine = () => {
    setForm((f) => ({
      ...f,
      lines: [...f.lines, { productId: "", qty: "1" }],
    }));
  };

  const removeLine = (idx: number) => {
    setForm((f) => ({
      ...f,
      lines: f.lines.filter((_, i) => i !== idx),
    }));
  };

  const handleSubmit = async () => {
    if (!form.siteId) {
      Alert.alert("Erro", "Selecione o site");
      return;
    }
    if (!form.reason.trim()) {
      Alert.alert("Erro", "Informe o motivo");
      return;
    }
    if (!form.dateNeeded) {
      Alert.alert("Erro", "Informe a data necessária (YYYY-MM-DD)");
      return;
    }
    const validLines = form.lines.filter((l) => l.productId);
    if (validLines.length === 0) {
      Alert.alert("Erro", "Adicione pelo menos um produto");
      return;
    }

    try {
      await createRequest({
        siteId: form.siteId as Id<"sites">,
        reason: form.reason,
        urgency: form.urgency,
        dateNeeded: new Date(form.dateNeeded).getTime(),
        lines: validLines.map((l) => ({
          productId: l.productId as Id<"products">,
          qty: Number(l.qty),
        })),
      });
      Alert.alert("Sucesso", "Solicitação enviada");
      resetForm();
    } catch (error) {
      Alert.alert("Erro", getErrorMessage(error, "Erro ao enviar"));
    }
  };

  const formatDate = (timestamp: number) =>
    new Date(timestamp).toLocaleDateString("pt-BR");

  const STATUS_VARIANTS: Record<
    string,
    "default" | "secondary" | "destructive" | "outline"
  > = {
    Pendente: "outline",
    Aprovado: "default",
    Rejeitado: "destructive",
    Convertido: "secondary",
  };

  return (
    <View className="gap-4">
      <Card>
        <CardHeader>
          <View className="flex-row items-center gap-2">
            <ClipboardList size={20} color="#6d5efc" />
            <CardTitle>Nova Solicitação</CardTitle>
          </View>
          <CardDescription>
            Solicite materiais ao administrador
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-3">
          <View className="gap-1">
            <Label>Site / Obra</Label>
            <Select
              value={form.siteId}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, siteId: v }))
              }
              options={siteOptions}
              placeholder="Selecione o site"
            />
          </View>
          <View className="gap-1">
            <Label>Urgência</Label>
            <Select
              value={form.urgency}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  urgency: v as "normal" | "urgente" | "critico",
                }))
              }
              options={urgencyOptions}
              placeholder="Urgência"
            />
          </View>
          <View className="gap-1">
            <Label>Data necessária (YYYY-MM-DD)</Label>
            <Input
              value={form.dateNeeded}
              onChangeText={(t) =>
                setForm((f) => ({ ...f, dateNeeded: t }))
              }
              placeholder="2026-04-20"
            />
          </View>
          <View className="gap-1">
            <Label>Motivo</Label>
            <Input
              value={form.reason}
              onChangeText={(t) =>
                setForm((f) => ({ ...f, reason: t }))
              }
              placeholder="Justificativa"
              multiline
              numberOfLines={3}
            />
          </View>

          <View className="flex-row items-center justify-between">
            <Label>Produtos</Label>
            <Button variant="outline" size="sm" onPress={addLine}>
              <View className="flex-row items-center gap-1">
                <Plus size={12} color="#666" />
                <ButtonText variant="outline">Produto</ButtonText>
              </View>
            </Button>
          </View>
          {form.lines.map((line, i) => (
            <View
              key={i}
              className="gap-2 border border-border rounded-md p-2"
            >
              <Select
                value={line.productId}
                onValueChange={(v) => {
                  setForm((f) => ({
                    ...f,
                    lines: f.lines.map((l, idx) =>
                      idx === i ? { ...l, productId: v } : l
                    ),
                  }));
                }}
                options={productOptions}
                placeholder="Produto"
              />
              <View className="flex-row gap-2 items-end">
                <View className="flex-1 gap-1">
                  <Label className="text-xs">Qtd</Label>
                  <Input
                    value={line.qty}
                    onChangeText={(t) => {
                      setForm((f) => ({
                        ...f,
                        lines: f.lines.map((l, idx) =>
                          idx === i ? { ...l, qty: t } : l
                        ),
                      }));
                    }}
                    keyboardType="numeric"
                  />
                </View>
                {form.lines.length > 1 && (
                  <Pressable
                    onPress={() => removeLine(i)}
                    className="p-2"
                  >
                    <XCircle size={16} color="#ef4444" />
                  </Pressable>
                )}
              </View>
            </View>
          ))}

          <Button onPress={handleSubmit}>
            <ButtonText>Enviar Solicitação</ButtonText>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Minhas Solicitações</CardTitle>
          <CardDescription>Acompanhe o status</CardDescription>
        </CardHeader>
        <CardContent>
          {!myRequests ? (
            <ActivityIndicator />
          ) : myRequests.length === 0 ? (
            <Text className="text-muted-foreground">
              Nenhuma solicitação
            </Text>
          ) : (
            <View className="gap-2">
              {myRequests.map((req) => (
                <View key={req._id}>
                  <Pressable
                    className="flex-row items-center justify-between rounded-lg border border-border p-3"
                    onPress={() =>
                      setExpandedId(
                        expandedId === req._id ? null : req._id
                      )
                    }
                  >
                    <View className="flex-row items-center gap-2 flex-1">
                      {expandedId === req._id ? (
                        <ChevronDown size={16} color="#666" />
                      ) : (
                        <ChevronRight size={16} color="#666" />
                      )}
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                          <Badge
                            variant={
                              STATUS_VARIANTS[req.status] ??
                              "outline"
                            }
                          >
                            {req.status}
                          </Badge>
                          <Text
                            className="text-foreground text-sm flex-1"
                            numberOfLines={1}
                          >
                            {req.site?.name ?? "—"}
                          </Text>
                        </View>
                        <Text className="text-muted-foreground text-xs mt-1">
                          Até {formatDateTime(req.dateNeeded)} •{" "}
                          {formatDateTime(req.createdAt)}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                  {expandedId === req._id && (
                    <View className="bg-secondary rounded-b-lg p-3 gap-2">
                      <Text className="text-sm text-foreground">
                        <Text className="font-medium">Motivo: </Text>
                        {req.reason}
                      </Text>
                      {req.reviewNotes && (
                        <Text className="text-sm text-foreground">
                          <Text className="font-medium">
                            Resposta:{" "}
                          </Text>
                          {req.reviewNotes}
                        </Text>
                      )}
                      {req.lines.map((line) => (
                        <View
                          key={line._id}
                          className="flex-row justify-between"
                        >
                          <Text className="text-sm text-foreground">
                            {line.product?.name ?? "—"}
                          </Text>
                          <Text className="text-sm text-muted-foreground">
                            {line.qty} {line.product?.unit}
                            {line.approvedQty != null
                              ? ` → ${line.approvedQty}`
                              : ""}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </CardContent>
      </Card>
    </View>
  );
}
