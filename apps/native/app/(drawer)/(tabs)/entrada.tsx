import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { Authenticated, AuthLoading, Unauthenticated, useQuery, useMutation } from "convex/react";
import { Plus, Check, Undo2, Trash2, ArrowDownToLine, Lock, ChevronDown, ChevronRight } from "lucide-react-native";
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

export default function EntradaTab() {
  return (
    <Container className="px-5 pt-4 pb-24">
      <Authenticated>
        <EntradaContent />
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

type ReceiptLineForm = { productId: string; qty: string; unitCost: string };

const STATUS_LABELS: Record<string, string> = {
  PendingReceipt: "Pendente",
  Accepted: "Aceito",
  Returned: "Devolvido",
  Discarded: "Descartado",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PendingReceipt: "outline",
  Accepted: "default",
  Returned: "secondary",
  Discarded: "destructive",
};

function EntradaContent() {
  const receipts = useQuery(api.receipts.list);
  const products = useQuery(api.products.list, { onlyActive: true });
  const suppliers = useQuery(api.suppliers.list, { onlyActive: true });

  const createReceipt = useMutation(api.receipts.createReceipt);
  const acceptReceipt = useMutation(api.receipts.acceptReceipt);
  const returnReceipt = useMutation(api.receipts.returnReceipt);
  const discardReceipt = useMutation(api.receipts.discardReceipt);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [form, setForm] = useState({
    supplierId: "",
    notes: "",
    lines: [{ productId: "", qty: "1", unitCost: "" }] as ReceiptLineForm[],
  });

  const resetForm = () => {
    setForm({ supplierId: "", notes: "", lines: [{ productId: "", qty: "1", unitCost: "" }] });
  };

  const addLine = () => {
    setForm((f) => ({ ...f, lines: [...f.lines, { productId: "", qty: "1", unitCost: "" }] }));
  };

  const removeLine = (index: number) => {
    setForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== index) }));
  };

  const updateLine = (index: number, field: keyof ReceiptLineForm, value: string) => {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((line, i) => (i === index ? { ...line, [field]: value } : line)),
    }));
  };

  const handleCreate = async () => {
    const validLines = form.lines.filter((l) => l.productId);
    if (validLines.length === 0) {
      Alert.alert("Erro", "Adicione pelo menos uma linha com produto");
      return;
    }
    try {
      await createReceipt({
        supplierId: form.supplierId ? (form.supplierId as Id<"suppliers">) : undefined,
        notes: form.notes || undefined,
        lines: validLines.map((l) => ({
          productId: l.productId as Id<"products">,
          qty: Number(l.qty),
          unitCost: l.unitCost ? Number(l.unitCost) : undefined,
          costSource: l.unitCost ? ("manual" as const) : undefined,
        })),
      });
      setIsCreateOpen(false);
      resetForm();
    } catch (error: any) {
      Alert.alert("Erro", error.message || "Erro ao criar recibo");
    }
  };

  const handleAccept = async (receiptId: Id<"receipts">) => {
    try {
      await acceptReceipt({ receiptId });
    } catch (error: any) {
      Alert.alert("Erro", error.message || "Erro ao aceitar recibo");
    }
  };

  const handleReturn = async (receiptId: Id<"receipts">) => {
    try {
      await returnReceipt({ receiptId });
    } catch (error: any) {
      Alert.alert("Erro", error.message || "Erro ao devolver recibo");
    }
  };

  const handleDiscard = (receiptId: Id<"receipts">) => {
    Alert.alert("Confirmar", "Deseja descartar este recibo?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Descartar",
        style: "destructive",
        onPress: async () => {
          try {
            await discardReceipt({ receiptId });
          } catch (error: any) {
            Alert.alert("Erro", error.message || "Erro ao descartar recibo");
          }
        },
      },
    ]);
  };

  const formatDate = (timestamp: number) => new Date(timestamp).toLocaleString("pt-BR");

  const productOptions = (products ?? []).map((p) => ({ label: `${p.name} (${p.unit})`, value: p._id }));
  const supplierOptions = (suppliers ?? []).map((s) => ({ label: s.name, value: s._id }));

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-2xl font-bold text-foreground">Recibos (Entrada)</Text>
          <Text className="text-muted-foreground text-sm">Gerencie recibos de entrada no armazém</Text>
        </View>
        <Button onPress={() => { resetForm(); setIsCreateOpen(true); }}>
          <View className="flex-row items-center gap-1">
            <Plus size={16} color="#fff" />
            <ButtonText>Novo</ButtonText>
          </View>
        </Button>
      </View>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogHeader>
          <DialogTitle>Criar Recibo</DialogTitle>
          <DialogDescription>Registre um novo recibo com linhas de produto</DialogDescription>
        </DialogHeader>
        <View className="gap-3 mt-3">
          <View className="gap-1">
            <Label>Fornecedor (opcional)</Label>
            <Select value={form.supplierId} onValueChange={(v) => setForm((f) => ({ ...f, supplierId: v }))} options={supplierOptions} placeholder="Selecione o fornecedor" />
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
              <View className="flex-row gap-2">
                <View className="flex-1 gap-1">
                  <Label className="text-xs">Qtd</Label>
                  <Input value={line.qty} onChangeText={(t) => updateLine(i, "qty", t)} keyboardType="numeric" />
                </View>
                <View className="flex-1 gap-1">
                  <Label className="text-xs">Custo unit.</Label>
                  <Input value={line.unitCost} onChangeText={(t) => updateLine(i, "unitCost", t)} keyboardType="numeric" placeholder="Opcional" />
                </View>
                {form.lines.length > 1 && (
                  <Pressable onPress={() => removeLine(i)} className="self-end p-2">
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
          <Button onPress={handleCreate}><ButtonText>Criar Recibo</ButtonText></Button>
        </DialogFooter>
      </Dialog>

      <Card>
        <CardHeader>
          <View className="flex-row items-center gap-2">
            <ArrowDownToLine size={20} color="#3478f6" />
            <CardTitle>Recibos</CardTitle>
          </View>
          <CardDescription>Lista de recibos e suas linhas de produto</CardDescription>
        </CardHeader>
        <CardContent>
          {!receipts ? (
            <ActivityIndicator />
          ) : receipts.length === 0 ? (
            <Text className="text-muted-foreground">Nenhum recibo encontrado</Text>
          ) : (
            <View className="gap-3">
              {receipts.map((receipt: any) => (
                <View key={receipt._id}>
                  <Pressable
                    className="flex-row items-center justify-between rounded-lg border border-border p-3"
                    onPress={() => setExpandedId(expandedId === receipt._id ? null : receipt._id)}
                  >
                    <View className="flex-row items-center gap-2 flex-1">
                      {expandedId === receipt._id ? <ChevronDown size={16} color="#666" /> : <ChevronRight size={16} color="#666" />}
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                          <Badge variant={STATUS_VARIANTS[receipt.status] ?? "outline"}>
                            {STATUS_LABELS[receipt.status] ?? receipt.status}
                          </Badge>
                          <Text className="text-foreground font-medium text-sm flex-1" numberOfLines={1}>
                            {receipt.supplier?.name ?? "-"}
                          </Text>
                        </View>
                        <Text className="text-muted-foreground text-xs mt-1">
                          {receipt.lines.length} produto(s) • {formatDate(receipt.createdAt)}
                        </Text>
                      </View>
                    </View>
                    {receipt.status === "PendingReceipt" && (
                      <View className="flex-row gap-1">
                        <Button size="sm" onPress={() => handleAccept(receipt._id)}>
                          <Check size={14} color="#fff" />
                        </Button>
                        <Button variant="outline" size="sm" onPress={() => handleReturn(receipt._id)}>
                          <Undo2 size={14} color="#666" />
                        </Button>
                        <Button variant="ghost" size="sm" onPress={() => handleDiscard(receipt._id)}>
                          <Trash2 size={14} color="#ef4444" />
                        </Button>
                      </View>
                    )}
                  </Pressable>
                  {expandedId === receipt._id && (
                    <View className="bg-secondary rounded-b-lg p-3 gap-2">
                      {receipt.lines.map((line: any) => (
                        <View key={line._id} className="flex-row items-center justify-between">
                          <Text className="text-foreground text-sm font-medium flex-1">
                            {line.product?.name ?? "Produto não encontrado"}
                          </Text>
                          <Text className="text-muted-foreground text-sm">
                            {line.qty} {line.product?.unit}
                            {line.unitCost != null ? ` • R$ ${line.unitCost.toFixed(2)}` : ""}
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
