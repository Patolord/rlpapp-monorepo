import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { Authenticated, AuthLoading, Unauthenticated, useQuery, useMutation } from "convex/react";
import { Link } from "expo-router";
import { Button, Chip, Spinner, Surface, useThemeColor } from "heroui-native";
import { Lock, Users, Plus, Pencil, Trash2, X } from "lucide-react-native";
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

export default function FornecedoresScreen() {
  return (
    <Container className="p-4">
      <Authenticated>
        <FornecedoresContent />
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

function FornecedoresContent() {
  const suppliers = useQuery(api.suppliers.list, {});
  const createSupplier = useMutation(api.suppliers.create);
  const updateSupplier = useMutation(api.suppliers.update);
  const removeSupplier = useMutation(api.suppliers.remove);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    contactName: "",
    email: "",
    phone: "",
    address: "",
  });

  const successColor = useThemeColor("success");
  const dangerColor = useThemeColor("danger");

  const resetForm = () => {
    setFormData({ name: "", contactName: "", email: "", phone: "", address: "" });
    setEditingSupplier(null);
  };

  const openCreate = () => {
    resetForm();
    setModalVisible(true);
  };

  const openEdit = (supplier: any) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      contactName: supplier.contactName || "",
      email: supplier.email || "",
      phone: supplier.phone || "",
      address: supplier.address || "",
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      Alert.alert("Erro", "Nome é obrigatório");
      return;
    }

    try {
      if (editingSupplier) {
        await updateSupplier({
          id: editingSupplier._id,
          name: formData.name,
          contactName: formData.contactName || undefined,
          email: formData.email || undefined,
          phone: formData.phone || undefined,
          address: formData.address || undefined,
        });
        Alert.alert("Sucesso", "Fornecedor atualizado");
      } else {
        await createSupplier({
          name: formData.name,
          contactName: formData.contactName || undefined,
          email: formData.email || undefined,
          phone: formData.phone || undefined,
          address: formData.address || undefined,
        });
        Alert.alert("Sucesso", "Fornecedor criado");
      }
      setModalVisible(false);
      resetForm();
    } catch (error: any) {
      Alert.alert("Erro", error.message || "Erro ao salvar");
    }
  };

  const handleDelete = (supplier: any) => {
    Alert.alert(
      "Desativar Fornecedor",
      `Deseja desativar "${supplier.name}"?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Desativar",
          style: "destructive",
          onPress: async () => {
            try {
              await removeSupplier({ id: supplier._id });
              Alert.alert("Sucesso", "Fornecedor desativado");
            } catch (error: any) {
              Alert.alert("Erro", error.message || "Erro ao desativar");
            }
          },
        },
      ]
    );
  };

  if (!suppliers) {
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
          <Text className="text-xl font-semibold text-foreground">Fornecedores</Text>
          <Text className="text-muted text-sm">{suppliers.length} cadastrados</Text>
        </View>
        <Button variant="primary" onPress={openCreate}>
          <Plus size={18} color="white" />
          <Button.Label>Novo</Button.Label>
        </Button>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {suppliers.length === 0 ? (
          <Surface variant="secondary" className="p-8 rounded-lg items-center">
            <Users size={48} color="#888" />
            <Text className="text-foreground font-medium mt-4">Nenhum Fornecedor</Text>
            <Text className="text-muted text-sm text-center mt-2">
              Cadastre o primeiro fornecedor
            </Text>
          </Surface>
        ) : (
          suppliers.map((supplier: any) => (
            <Surface key={supplier._id} variant="secondary" className="mb-3 rounded-lg p-4">
              <View className="flex-row items-start justify-between">
                <View className="flex-1">
                  <View className="flex-row items-center gap-2 mb-1">
                    <Text className="text-foreground font-semibold">{supplier.name}</Text>
                    <Chip
                      variant="secondary"
                      color={supplier.isActive ? "success" : "default"}
                      size="sm"
                    >
                      <Chip.Label>{supplier.isActive ? "Ativo" : "Inativo"}</Chip.Label>
                    </Chip>
                  </View>
                  {supplier.contactName && (
                    <Text className="text-muted text-sm">{supplier.contactName}</Text>
                  )}
                  <View className="mt-2 gap-1">
                    {supplier.email && (
                      <Text className="text-muted text-xs">{supplier.email}</Text>
                    )}
                    {supplier.phone && (
                      <Text className="text-muted text-xs">{supplier.phone}</Text>
                    )}
                  </View>
                </View>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    className="p-2"
                    onPress={() => openEdit(supplier)}
                  >
                    <Pencil size={18} color={successColor} />
                  </TouchableOpacity>
                  {supplier.isActive && (
                    <TouchableOpacity
                      className="p-2"
                      onPress={() => handleDelete(supplier)}
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
                {editingSupplier ? "Editar Fornecedor" : "Novo Fornecedor"}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={24} color="#888" />
              </TouchableOpacity>
            </View>

            <ScrollView className="max-h-96">
              <View className="gap-4">
                <View>
                  <Text className="text-muted text-xs mb-1">Nome da Empresa *</Text>
                  <TextInput
                    className="bg-default/20 text-foreground rounded-lg px-3 py-3"
                    placeholder="Nome da empresa"
                    placeholderTextColor="#888"
                    value={formData.name}
                    onChangeText={(text) => setFormData({ ...formData, name: text })}
                  />
                </View>

                <View>
                  <Text className="text-muted text-xs mb-1">Nome do Contato</Text>
                  <TextInput
                    className="bg-default/20 text-foreground rounded-lg px-3 py-3"
                    placeholder="Nome do contato"
                    placeholderTextColor="#888"
                    value={formData.contactName}
                    onChangeText={(text) => setFormData({ ...formData, contactName: text })}
                  />
                </View>

                <View>
                  <Text className="text-muted text-xs mb-1">Email</Text>
                  <TextInput
                    className="bg-default/20 text-foreground rounded-lg px-3 py-3"
                    placeholder="email@exemplo.com"
                    placeholderTextColor="#888"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={formData.email}
                    onChangeText={(text) => setFormData({ ...formData, email: text })}
                  />
                </View>

                <View>
                  <Text className="text-muted text-xs mb-1">Telefone</Text>
                  <TextInput
                    className="bg-default/20 text-foreground rounded-lg px-3 py-3"
                    placeholder="(00) 00000-0000"
                    placeholderTextColor="#888"
                    keyboardType="phone-pad"
                    value={formData.phone}
                    onChangeText={(text) => setFormData({ ...formData, phone: text })}
                  />
                </View>

                <View>
                  <Text className="text-muted text-xs mb-1">Endereço</Text>
                  <TextInput
                    className="bg-default/20 text-foreground rounded-lg px-3 py-3"
                    placeholder="Endereço completo"
                    placeholderTextColor="#888"
                    value={formData.address}
                    onChangeText={(text) => setFormData({ ...formData, address: text })}
                  />
                </View>

                <Button variant="primary" onPress={handleSave}>
                  <Button.Label>{editingSupplier ? "Salvar" : "Criar"}</Button.Label>
                </Button>
              </View>
            </ScrollView>
          </Surface>
        </View>
      </Modal>
    </>
  );
}
