import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { Authenticated, AuthLoading, Unauthenticated, useQuery, useMutation } from "convex/react";
import { Link } from "expo-router";
import { Button, Chip, Spinner, Surface, useThemeColor } from "heroui-native";
import { Lock, Package, Plus, Pencil, Trash2, X } from "lucide-react-native";
import { useState } from "react";
import {
  Alert,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Container } from "@/components/container";

export default function ProdutosScreen() {
  return (
    <Container className="p-4">
      <Authenticated>
        <ProdutosContent />
      </Authenticated>
      <Unauthenticated>
        <Surface variant="secondary" className="p-6 rounded-lg items-center">
          <Lock size={48} color="#888" />
          <Text className="text-foreground font-medium mt-4">Acesso Restrito</Text>
          <Link href="/(auth)/sign-in" asChild>
            <Button variant="primary" className="mt-4">
              <Button.Label>Entrar</Button.Label>
            </Button>
          </Link>
        </Surface>
      </Unauthenticated>
      <AuthLoading>
        <View className="flex-1 items-center justify-center">
          <Spinner size="lg" />
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

  const [modalVisible, setModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    unit: "un",
    minQuantity: "0",
  });

  const successColor = useThemeColor("success");
  const dangerColor = useThemeColor("danger");

  const resetForm = () => {
    setFormData({ name: "", description: "", unit: "un", minQuantity: "0" });
    setEditingProduct(null);
  };

  const openCreate = () => {
    resetForm();
    setModalVisible(true);
  };

  const openEdit = (product: any) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description || "",
      unit: product.unit,
      minQuantity: String(product.minQuantity),
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      Alert.alert("Erro", "Nome é obrigatório");
      return;
    }

    try {
      if (editingProduct) {
        await updateProduct({
          id: editingProduct._id,
          name: formData.name,
          description: formData.description || undefined,
          unit: formData.unit,
          minQuantity: Number(formData.minQuantity),
        });
        Alert.alert("Sucesso", "Produto atualizado");
      } else {
        await createProduct({
          name: formData.name,
          description: formData.description || undefined,
          unit: formData.unit,
          minQuantity: Number(formData.minQuantity),
        });
        Alert.alert("Sucesso", "Produto criado");
      }
      setModalVisible(false);
      resetForm();
    } catch (error: any) {
      Alert.alert("Erro", error.message || "Erro ao salvar");
    }
  };

  const handleDelete = (product: any) => {
    Alert.alert(
      "Desativar Produto",
      `Deseja desativar "${product.name}"?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Desativar",
          style: "destructive",
          onPress: async () => {
            try {
              await removeProduct({ id: product._id });
              Alert.alert("Sucesso", "Produto desativado");
            } catch (error: any) {
              Alert.alert("Erro", error.message || "Erro ao desativar");
            }
          },
        },
      ]
    );
  };

  if (!products) {
    return (
      <View className="flex-1 items-center justify-center">
        <Spinner size="lg" />
      </View>
    );
  }

  return (
    <>
      <View className="flex-row items-center justify-between mb-4">
        <View>
          <Text className="text-xl font-semibold text-foreground">Produtos</Text>
          <Text className="text-muted text-sm">{products.length} cadastrados</Text>
        </View>
        <Button variant="primary" onPress={openCreate}>
          <Plus size={18} color="white" />
          <Button.Label>Novo</Button.Label>
        </Button>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {products.length === 0 ? (
          <Surface variant="secondary" className="p-8 rounded-lg items-center">
            <Package size={48} color="#888" />
            <Text className="text-foreground font-medium mt-4">Nenhum Produto</Text>
            <Text className="text-muted text-sm text-center mt-2">
              Cadastre o primeiro produto
            </Text>
          </Surface>
        ) : (
          products.map((product: any) => (
            <Surface key={product._id} variant="secondary" className="mb-3 rounded-lg p-4">
              <View className="flex-row items-start justify-between">
                <View className="flex-1">
                  <View className="flex-row items-center gap-2 mb-1">
                    <Text className="text-foreground font-semibold">{product.name}</Text>
                    <Chip
                      variant="secondary"
                      color={product.isActive ? "success" : "default"}
                      size="sm"
                    >
                      <Chip.Label>{product.isActive ? "Ativo" : "Inativo"}</Chip.Label>
                    </Chip>
                  </View>
                  {product.description && (
                    <Text className="text-muted text-sm mb-1">{product.description}</Text>
                  )}
                  <View className="flex-row gap-4 mt-2">
                    <Text className="text-muted text-xs">
                      Unidade: <Text className="text-foreground">{product.unit}</Text>
                    </Text>
                    <Text className="text-muted text-xs">
                      Mín: <Text className="text-foreground">{product.minQuantity}</Text>
                    </Text>
                  </View>
                </View>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    className="p-2"
                    onPress={() => openEdit(product)}
                  >
                    <Pencil size={18} color={successColor} />
                  </TouchableOpacity>
                  {product.isActive && (
                    <TouchableOpacity
                      className="p-2"
                      onPress={() => handleDelete(product)}
                    >
                      <Trash2 size={18} color={dangerColor} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </Surface>
          ))
        )}
        <View className="h-8" />
      </ScrollView>

      {/* Form Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <Surface variant="primary" className="rounded-t-xl p-4 pb-8">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-foreground text-lg font-semibold">
                {editingProduct ? "Editar Produto" : "Novo Produto"}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={24} color="#888" />
              </TouchableOpacity>
            </View>

            <View className="gap-4">
              <View>
                <Text className="text-muted text-xs mb-1">Nome *</Text>
                <TextInput
                  className="bg-default/20 text-foreground rounded-lg px-3 py-3"
                  placeholder="Nome do produto"
                  placeholderTextColor="#888"
                  value={formData.name}
                  onChangeText={(text) => setFormData({ ...formData, name: text })}
                />
              </View>

              <View>
                <Text className="text-muted text-xs mb-1">Descrição</Text>
                <TextInput
                  className="bg-default/20 text-foreground rounded-lg px-3 py-3"
                  placeholder="Descrição (opcional)"
                  placeholderTextColor="#888"
                  value={formData.description}
                  onChangeText={(text) => setFormData({ ...formData, description: text })}
                />
              </View>

              <View className="flex-row gap-4">
                <View className="flex-1">
                  <Text className="text-muted text-xs mb-1">Unidade</Text>
                  <TextInput
                    className="bg-default/20 text-foreground rounded-lg px-3 py-3"
                    placeholder="un, kg, l..."
                    placeholderTextColor="#888"
                    value={formData.unit}
                    onChangeText={(text) => setFormData({ ...formData, unit: text })}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-muted text-xs mb-1">Qtd. Mínima</Text>
                  <TextInput
                    className="bg-default/20 text-foreground rounded-lg px-3 py-3"
                    placeholder="0"
                    placeholderTextColor="#888"
                    keyboardType="numeric"
                    value={formData.minQuantity}
                    onChangeText={(text) => setFormData({ ...formData, minQuantity: text })}
                  />
                </View>
              </View>

              <Button variant="primary" onPress={handleSave}>
                <Button.Label>{editingProduct ? "Salvar" : "Criar"}</Button.Label>
              </Button>
            </View>
          </Surface>
        </View>
      </Modal>
    </>
  );
}
