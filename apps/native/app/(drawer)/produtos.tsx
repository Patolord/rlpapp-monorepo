import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Doc, Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { Authenticated, AuthLoading, Unauthenticated, useQuery, useMutation } from "convex/react";
import { Plus, Pencil, Trash2, Lock } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { Link } from "expo-router";

import { Container } from "@/components/container";
import { Button, ButtonText } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ProdutosScreen() {
  return (
    <Container className="px-5 pt-4 pb-4">
      <Authenticated>
        <ProdutosContent />
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
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      </AuthLoading>
    </Container>
  );
}

function ProdutosContent() {
  const products = useQuery(api.products.list, {});
  const createProduct = useMutation(api.products.create);
  const updateProduct = useMutation(api.products.update);
  const removeProduct = useMutation(api.products.remove);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Doc<"products"> | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    unit: "un",
    minQuantity: "0",
  });

  const resetForm = () => {
    setFormData({ name: "", description: "", unit: "un", minQuantity: "0" });
  };

  const handleCreate = async () => {
    try {
      await createProduct({
        name: formData.name,
        description: formData.description || undefined,
        unit: formData.unit,
        minQuantity: Number(formData.minQuantity),
      });
      setIsCreateOpen(false);
      resetForm();
    } catch (error) {
      Alert.alert("Erro", "Erro ao criar produto");
    }
  };

  const handleUpdate = async () => {
    if (!editingProduct) return;
    try {
      await updateProduct({
        id: editingProduct._id,
        name: formData.name,
        description: formData.description || undefined,
        unit: formData.unit,
        minQuantity: Number(formData.minQuantity),
      });
      setEditingProduct(null);
      resetForm();
    } catch (error) {
      Alert.alert("Erro", "Erro ao atualizar produto");
    }
  };

  const handleDelete = (id: Id<"products">) => {
    Alert.alert("Confirmar", "Deseja realmente desativar este produto?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Desativar",
        style: "destructive",
        onPress: async () => {
          try {
            await removeProduct({ id });
          } catch (error) {
            Alert.alert("Erro", "Erro ao desativar produto");
          }
        },
      },
    ]);
  };

  const openEdit = (product: Doc<"products">) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description || "",
      unit: product.unit,
      minQuantity: String(product.minQuantity),
    });
  };

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-2xl font-bold text-foreground">Produtos</Text>
          <Text className="text-muted-foreground text-sm">Gerencie os produtos do estoque</Text>
        </View>
        <Button
          onPress={() => {
            resetForm();
            setIsCreateOpen(true);
          }}
        >
          <View className="flex-row items-center gap-1">
            <Plus size={16} color="#fff" />
            <ButtonText>Novo</ButtonText>
          </View>
        </Button>
      </View>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogHeader>
          <DialogTitle>Novo Produto</DialogTitle>
          <DialogDescription>Preencha os dados do produto</DialogDescription>
        </DialogHeader>
        <View className="gap-3 mt-3">
          <View className="gap-1">
            <Label>Nome</Label>
            <Input value={formData.name} onChangeText={(t) => setFormData((f) => ({ ...f, name: t }))} />
          </View>
          <View className="gap-1">
            <Label>Descrição</Label>
            <Input value={formData.description} onChangeText={(t) => setFormData((f) => ({ ...f, description: t }))} />
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1 gap-1">
              <Label>Unidade</Label>
              <Input value={formData.unit} onChangeText={(t) => setFormData((f) => ({ ...f, unit: t }))} placeholder="un, kg, l..." />
            </View>
            <View className="flex-1 gap-1">
              <Label>Qtd. Mínima</Label>
              <Input value={formData.minQuantity} onChangeText={(t) => setFormData((f) => ({ ...f, minQuantity: t }))} keyboardType="numeric" />
            </View>
          </View>
        </View>
        <DialogFooter>
          <Button variant="outline" onPress={() => setIsCreateOpen(false)}>
            <ButtonText variant="outline">Cancelar</ButtonText>
          </Button>
          <Button onPress={handleCreate}>
            <ButtonText>Criar</ButtonText>
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={!!editingProduct} onOpenChange={(open) => !open && setEditingProduct(null)}>
        <DialogHeader>
          <DialogTitle>Editar Produto</DialogTitle>
          <DialogDescription>Atualize os dados do produto</DialogDescription>
        </DialogHeader>
        <View className="gap-3 mt-3">
          <View className="gap-1">
            <Label>Nome</Label>
            <Input value={formData.name} onChangeText={(t) => setFormData((f) => ({ ...f, name: t }))} />
          </View>
          <View className="gap-1">
            <Label>Descrição</Label>
            <Input value={formData.description} onChangeText={(t) => setFormData((f) => ({ ...f, description: t }))} />
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1 gap-1">
              <Label>Unidade</Label>
              <Input value={formData.unit} onChangeText={(t) => setFormData((f) => ({ ...f, unit: t }))} />
            </View>
            <View className="flex-1 gap-1">
              <Label>Qtd. Mínima</Label>
              <Input value={formData.minQuantity} onChangeText={(t) => setFormData((f) => ({ ...f, minQuantity: t }))} keyboardType="numeric" />
            </View>
          </View>
        </View>
        <DialogFooter>
          <Button variant="outline" onPress={() => setEditingProduct(null)}>
            <ButtonText variant="outline">Cancelar</ButtonText>
          </Button>
          <Button onPress={handleUpdate}>
            <ButtonText>Salvar</ButtonText>
          </Button>
        </DialogFooter>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Produtos</CardTitle>
        </CardHeader>
        <CardContent>
          {!products ? (
            <ActivityIndicator />
          ) : products.length === 0 ? (
            <Text className="text-muted-foreground">Nenhum produto cadastrado</Text>
          ) : (
            <View className="gap-3">
              {products.map((product) => (
                <View key={product._id} className="flex-row items-center justify-between rounded-lg border border-border p-3">
                  <View className="flex-1">
                    <Text className="text-foreground font-medium">{product.name}</Text>
                    <Text className="text-muted-foreground text-xs mt-0.5">
                      {product.unit} • Mín: {product.minQuantity}
                    </Text>
                    {product.description ? (
                      <Text className="text-muted-foreground text-xs mt-0.5">{product.description}</Text>
                    ) : null}
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Badge variant={product.isActive ? "success" : "secondary"}>
                      {product.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                    <Pressable onPress={() => openEdit(product)} className="p-2">
                      <Pencil size={16} color="#666" />
                    </Pressable>
                    {product.isActive && (
                      <Pressable onPress={() => handleDelete(product._id)} className="p-2">
                        <Trash2 size={16} color="#ef4444" />
                      </Pressable>
                    )}
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
