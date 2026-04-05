import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useQuery, useMutation } from "convex/react";
import { Plus, Minus, Settings } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";

import { Button, ButtonText } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export function InventoryAjustesContent() {
  const products = useQuery(api.products.list, { onlyActive: true });
  const stock = useQuery(api.inventory.getStock);
  const adjustEvents = useQuery(api.inventory.listEvents, {
    type: "InventoryAdjust",
    limit: 50,
  });

  const adjustInventory = useMutation(api.inventory.adjustInventory);

  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [adjustForm, setAdjustForm] = useState({
    productId: "",
    adjustmentType: "add" as "add" | "remove",
    quantity: "1",
    reason: "",
  });

  const resetForm = () => {
    setAdjustForm({ productId: "", adjustmentType: "add", quantity: "1", reason: "" });
  };

  const handleAdjust = async () => {
    if (!adjustForm.productId || !adjustForm.reason) {
      Alert.alert("Erro", "Preencha todos os campos obrigatórios");
      return;
    }
    try {
      const qtyDelta =
        adjustForm.adjustmentType === "add"
          ? Number(adjustForm.quantity)
          : -Number(adjustForm.quantity);

      await adjustInventory({
        productId: adjustForm.productId as Id<"products">,
        qtyDelta,
        reason: adjustForm.reason,
      });
      setIsAdjustOpen(false);
      resetForm();
    } catch (error: any) {
      Alert.alert("Erro", error.message || "Erro ao realizar ajuste");
    }
  };

  const formatDate = (timestamp: number) => new Date(timestamp).toLocaleString("pt-BR");

  const productOptions = (products ?? []).map((p) => ({
    label: `${p.name} (${p.unit})`,
    value: p._id,
  }));

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-2xl font-bold text-foreground">Ajustes de Inventário</Text>
          <Text className="text-muted-foreground text-sm">
            Ajustes manuais (inventário, perdas, correções)
          </Text>
        </View>
        <Button onPress={() => { resetForm(); setIsAdjustOpen(true); }}>
          <View className="flex-row items-center gap-1">
            <Settings size={16} color="#fff" />
            <ButtonText>Ajuste</ButtonText>
          </View>
        </Button>
      </View>

      <Dialog open={isAdjustOpen} onOpenChange={setIsAdjustOpen}>
        <DialogHeader>
          <DialogTitle>Ajuste de Inventário</DialogTitle>
          <DialogDescription>Cria um evento InventoryAdjust no ledger</DialogDescription>
        </DialogHeader>
        <View className="gap-3 mt-3">
          <View className="gap-1">
            <Label>Produto</Label>
            <Select
              value={adjustForm.productId}
              onValueChange={(v) => setAdjustForm((f) => ({ ...f, productId: v }))}
              options={productOptions}
              placeholder="Selecione o produto"
            />
          </View>
          <View className="gap-1">
            <Label>Tipo de Ajuste</Label>
            <View className="flex-row gap-2">
              <Button
                variant={adjustForm.adjustmentType === "add" ? "default" : "outline"}
                className="flex-1"
                onPress={() => setAdjustForm((f) => ({ ...f, adjustmentType: "add" }))}
              >
                <View className="flex-row items-center gap-1">
                  <Plus size={16} color={adjustForm.adjustmentType === "add" ? "#fff" : "#666"} />
                  <ButtonText variant={adjustForm.adjustmentType === "add" ? "default" : "outline"}>
                    Adicionar
                  </ButtonText>
                </View>
              </Button>
              <Button
                variant={adjustForm.adjustmentType === "remove" ? "destructive" : "outline"}
                className="flex-1"
                onPress={() => setAdjustForm((f) => ({ ...f, adjustmentType: "remove" }))}
              >
                <View className="flex-row items-center gap-1">
                  <Minus size={16} color={adjustForm.adjustmentType === "remove" ? "#fff" : "#666"} />
                  <ButtonText variant={adjustForm.adjustmentType === "remove" ? "destructive" : "outline"}>
                    Remover
                  </ButtonText>
                </View>
              </Button>
            </View>
          </View>
          <View className="gap-1">
            <Label>Quantidade</Label>
            <Input
              value={adjustForm.quantity}
              onChangeText={(t) => setAdjustForm((f) => ({ ...f, quantity: t }))}
              keyboardType="numeric"
            />
          </View>
          <View className="gap-1">
            <Label>Motivo do Ajuste *</Label>
            <Input
              value={adjustForm.reason}
              onChangeText={(t) => setAdjustForm((f) => ({ ...f, reason: t }))}
              placeholder="Ex: Inventário físico, perda, correção..."
            />
          </View>
        </View>
        <DialogFooter>
          <Button variant="outline" onPress={() => setIsAdjustOpen(false)}>
            <ButtonText variant="outline">Cancelar</ButtonText>
          </Button>
          <Button
            variant={adjustForm.adjustmentType === "remove" ? "destructive" : "default"}
            onPress={handleAdjust}
          >
            <ButtonText variant={adjustForm.adjustmentType === "remove" ? "destructive" : "default"}>
              {adjustForm.adjustmentType === "add" ? "Adicionar" : "Remover"} ao Estoque
            </ButtonText>
          </Button>
        </DialogFooter>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Snapshot do Estoque</CardTitle>
          <CardDescription>Derivado do ledger de eventos de inventário</CardDescription>
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
                    <Text className="text-foreground font-medium text-sm">
                      {item.product?.name ?? "?"}
                    </Text>
                    <Text className="text-muted-foreground text-xs">
                      {item.qtyOnHand} {item.product?.unit} • Mín: {item.product?.minQuantity}
                    </Text>
                  </View>
                  <View className="items-end gap-1">
                    <Text className="text-foreground text-sm">
                      {item.avgCost > 0 ? `R$ ${item.avgCost.toFixed(2)}` : "-"}
                    </Text>
                    {item.product && item.qtyOnHand < item.product.minQuantity ? (
                      <Badge variant="destructive">Abaixo</Badge>
                    ) : (
                      <Badge variant="secondary">OK</Badge>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de Ajustes</CardTitle>
          <CardDescription>Últimos ajustes realizados</CardDescription>
        </CardHeader>
        <CardContent>
          {!adjustEvents ? (
            <ActivityIndicator />
          ) : adjustEvents.length === 0 ? (
            <Text className="text-muted-foreground">Nenhum ajuste realizado</Text>
          ) : (
            <View className="gap-2">
              {adjustEvents.map((event: any) => (
                <View key={event._id} className="rounded-lg border border-border p-3">
                  <View className="flex-row items-center justify-between mb-1">
                    <Text className="text-foreground font-medium text-sm">
                      {event.product?.name ?? "?"}
                    </Text>
                    <Text className="text-muted-foreground text-xs">{formatDate(event.createdAt)}</Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text
                      className="font-medium text-sm"
                      style={{ color: event.qtyDelta > 0 ? "#16a34a" : "#dc2626" }}
                    >
                      {event.qtyDelta > 0 ? "+" : ""}
                      {event.qtyDelta} {event.product?.unit}
                    </Text>
                    <Text className="text-muted-foreground text-xs" numberOfLines={1}>
                      {event.refId}
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
