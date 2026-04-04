import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { Authenticated, AuthLoading, Unauthenticated, useQuery, useMutation } from "convex/react";
import { Plus, Check, PackageCheck, XCircle, ArrowUpFromLine, Lock, ChevronDown, ChevronRight, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { Link } from "expo-router";

import { Container } from "@/components/container";
import { Button, ButtonText } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export default function SaidaTab() {
  return (
    <Container className="px-5 pt-4 pb-24">
      <Authenticated>
        <SaidaContent />
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

type ShipmentLineForm = { productId: string; qty: string };

const STATUS_LABELS: Record<string, string> = {
  RegisteredOut: "Saída Registrada",
  PendingShipment: "Aguardando Envio",
  DeliveredConfirmed: "Entregue",
  CanceledBeforeLeave: "Cancelado",
  ReversalApplied: "Reversão Aplicada",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  RegisteredOut: "outline",
  PendingShipment: "secondary",
  DeliveredConfirmed: "default",
  CanceledBeforeLeave: "destructive",
  ReversalApplied: "destructive",
};

function SaidaContent() {
  const shipments = useQuery(api.shipments.list);
  const products = useQuery(api.products.list, { onlyActive: true });
  const sites = useQuery(api.sites.list, { onlyActive: true });
  const stock = useQuery(api.inventory.getStock);

  const createShipment = useMutation(api.shipments.createShipment);
  const stageShipment = useMutation(api.shipments.stageShipment);
  const confirmDelivery = useMutation(api.shipments.confirmDelivery);
  const cancelBeforeLeave = useMutation(api.shipments.cancelBeforeLeave);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [form, setForm] = useState({
    toSiteId: "",
    notes: "",
    lines: [{ productId: "", qty: "1" }] as ShipmentLineForm[],
  });

  const resetForm = () => {
    setForm({ toSiteId: "", notes: "", lines: [{ productId: "", qty: "1" }] });
  };

  const addLine = () => {
    setForm((f) => ({ ...f, lines: [...f.lines, { productId: "", qty: "1" }] }));
  };

  const removeLine = (index: number) => {
    setForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== index) }));
  };

  const updateLine = (index: number, field: keyof ShipmentLineForm, value: string) => {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((line, i) => (i === index ? { ...line, [field]: value } : line)),
    }));
  };

  const getStockForProduct = (productId: string) => {
    const snap = stock?.find((s: any) => s.productId === productId);
    return snap?.qtyOnHand ?? 0;
  };

  const handleCreate = async () => {
    if (!form.toSiteId) {
      Alert.alert("Erro", "Selecione o site de destino");
      return;
    }
    const validLines = form.lines.filter((l) => l.productId);
    if (validLines.length === 0) {
      Alert.alert("Erro", "Adicione pelo menos uma linha com produto");
      return;
    }
    try {
      await createShipment({
        toSiteId: form.toSiteId as Id<"sites">,
        notes: form.notes || undefined,
        lines: validLines.map((l) => ({
          productId: l.productId as Id<"products">,
          qty: Number(l.qty),
        })),
      });
      setIsCreateOpen(false);
      resetForm();
    } catch (error: any) {
      Alert.alert("Erro", error.message || "Erro ao criar remessa");
    }
  };

  const handleStage = async (shipmentId: Id<"shipments">) => {
    try {
      await stageShipment({ shipmentId });
    } catch (error: any) {
      Alert.alert("Erro", error.message || "Erro ao preparar remessa");
    }
  };

  const handleConfirmDelivery = async (shipmentId: Id<"shipments">) => {
    try {
      await confirmDelivery({ shipmentId });
    } catch (error: any) {
      Alert.alert("Erro", error.message || "Erro ao confirmar entrega");
    }
  };

  const handleCancel = (shipmentId: Id<"shipments">) => {
    Alert.alert("Confirmar", "Cancelar remessa? O estoque será restaurado no armazém.", [
      { text: "Não", style: "cancel" },
      {
        text: "Cancelar Remessa",
        style: "destructive",
        onPress: async () => {
          try {
            await cancelBeforeLeave({ shipmentId });
          } catch (error: any) {
            Alert.alert("Erro", error.message || "Erro ao cancelar remessa");
          }
        },
      },
    ]);
  };

  const formatDate = (timestamp: number) => new Date(timestamp).toLocaleString("pt-BR");

  const canAct = (status: string) => status === "RegisteredOut" || status === "PendingShipment";

  const productOptions = (products ?? []).map((p) => ({
    label: `${p.name} - Disp: ${getStockForProduct(p._id)} ${p.unit}`,
    value: p._id,
  }));
  const siteOptions = (sites ?? []).map((s) => ({ label: s.name, value: s._id }));

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-2xl font-bold text-foreground">Remessas (Saída)</Text>
          <Text className="text-muted-foreground text-sm">Gerencie remessas do armazém para sites</Text>
        </View>
        <Button onPress={() => { resetForm(); setIsCreateOpen(true); }}>
          <View className="flex-row items-center gap-1">
            <Plus size={16} color="#fff" />
            <ButtonText>Nova</ButtonText>
          </View>
        </Button>
      </View>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogHeader>
          <DialogTitle>Criar Remessa</DialogTitle>
          <DialogDescription>A saída do estoque é aplicada imediatamente</DialogDescription>
        </DialogHeader>
        <View className="gap-3 mt-3">
          <View className="gap-1">
            <Label>Site de Destino</Label>
            <Select value={form.toSiteId} onValueChange={(v) => setForm((f) => ({ ...f, toSiteId: v }))} options={siteOptions} placeholder="Selecione o site" />
          </View>
          <View className="gap-1">
            <Label>Observações</Label>
            <Input value={form.notes} onChangeText={(t) => setForm((f) => ({ ...f, notes: t }))} placeholder="Notas opcionais" />
          </View>
          <View className="flex-row items-center justify-between">
            <Label>Linhas</Label>
            <Button variant="outline" size="sm" onPress={addLine}>
              <View className="flex-row items-center gap-1">
                <Plus size={12} color="#666" />
                <ButtonText variant="outline">Linha</ButtonText>
              </View>
            </Button>
          </View>
          {form.lines.map((line, i) => (
            <View key={i} className="gap-2 border border-border rounded-md p-2">
              <Select value={line.productId} onValueChange={(v) => updateLine(i, "productId", v)} options={productOptions} placeholder="Produto" />
              <View className="flex-row gap-2 items-end">
                <View className="flex-1 gap-1">
                  <Label className="text-xs">Qtd</Label>
                  <Input value={line.qty} onChangeText={(t) => updateLine(i, "qty", t)} keyboardType="numeric" />
                </View>
                {form.lines.length > 1 && (
                  <Pressable onPress={() => removeLine(i)} className="p-2">
                    <Trash2 size={16} color="#ef4444" />
                  </Pressable>
                )}
              </View>
            </View>
          ))}
        </View>
        <DialogFooter>
          <Button variant="outline" onPress={() => setIsCreateOpen(false)}>
            <ButtonText variant="outline">Cancelar</ButtonText>
          </Button>
          <Button onPress={handleCreate}><ButtonText>Criar Remessa</ButtonText></Button>
        </DialogFooter>
      </Dialog>

      <Card>
        <CardHeader>
          <View className="flex-row items-center gap-2">
            <ArrowUpFromLine size={20} color="#6d5efc" />
            <CardTitle>Remessas</CardTitle>
          </View>
          <CardDescription>Lista de remessas e suas transições de estado</CardDescription>
        </CardHeader>
        <CardContent>
          {!shipments ? (
            <ActivityIndicator />
          ) : shipments.length === 0 ? (
            <Text className="text-muted-foreground">Nenhuma remessa encontrada</Text>
          ) : (
            <View className="gap-3">
              {shipments.map((shipment: any) => (
                <View key={shipment._id}>
                  <Pressable
                    className="flex-row items-center justify-between rounded-lg border border-border p-3"
                    onPress={() => setExpandedId(expandedId === shipment._id ? null : shipment._id)}
                  >
                    <View className="flex-row items-center gap-2 flex-1">
                      {expandedId === shipment._id ? <ChevronDown size={16} color="#666" /> : <ChevronRight size={16} color="#666" />}
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                          <Badge variant={STATUS_VARIANTS[shipment.status] ?? "outline"}>
                            {STATUS_LABELS[shipment.status] ?? shipment.status}
                          </Badge>
                          <Text className="text-foreground font-medium text-sm flex-1" numberOfLines={1}>
                            {shipment.site?.name ?? "-"}
                          </Text>
                        </View>
                        <Text className="text-muted-foreground text-xs mt-1">
                          {shipment.lines.length} produto(s) • {formatDate(shipment.createdAt)}
                        </Text>
                      </View>
                    </View>
                    {canAct(shipment.status) && (
                      <View className="flex-row gap-1">
                        {shipment.status === "RegisteredOut" && (
                          <Button variant="outline" size="sm" onPress={() => handleStage(shipment._id)}>
                            <PackageCheck size={14} color="#666" />
                          </Button>
                        )}
                        <Button size="sm" onPress={() => handleConfirmDelivery(shipment._id)}>
                          <Check size={14} color="#fff" />
                        </Button>
                        <Button variant="ghost" size="sm" onPress={() => handleCancel(shipment._id)}>
                          <XCircle size={14} color="#ef4444" />
                        </Button>
                      </View>
                    )}
                  </Pressable>
                  {expandedId === shipment._id && (
                    <View className="bg-secondary rounded-b-lg p-3 gap-2">
                      {shipment.lines.map((line: any) => (
                        <View key={line._id} className="flex-row items-center justify-between">
                          <Text className="text-foreground text-sm font-medium flex-1">
                            {line.product?.name ?? "Produto não encontrado"}
                          </Text>
                          <Text className="text-muted-foreground text-sm">
                            {line.qty} {line.product?.unit}
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

      <Card>
        <CardHeader>
          <CardTitle>Estoque do Armazém</CardTitle>
          <CardDescription>Snapshot atual derivado do ledger de eventos</CardDescription>
        </CardHeader>
        <CardContent>
          {!stock ? (
            <ActivityIndicator />
          ) : stock.length === 0 ? (
            <Text className="text-muted-foreground">Armazém vazio</Text>
          ) : (
            <View className="gap-2">
              {stock.map((item: any) => (
                <View key={item._id} className="flex-row items-center justify-between rounded-lg border border-border p-3">
                  <View className="flex-1">
                    <Text className="text-foreground font-medium text-sm">{item.product?.name ?? "?"}</Text>
                    <Text className="text-muted-foreground text-xs">
                      {item.qtyOnHand} {item.product?.unit}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-foreground text-sm">
                      {item.avgCost > 0 ? `R$ ${item.avgCost.toFixed(2)}` : "-"}
                    </Text>
                    <Text className="text-muted-foreground text-xs">
                      {item.totalValue > 0 ? `Total: R$ ${item.totalValue.toFixed(2)}` : ""}
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
