import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { Authenticated, AuthLoading, Unauthenticated, useQuery, useMutation } from "convex/react";
import { Link } from "expo-router";
import { Button, Chip, Spinner, Surface, useThemeColor } from "heroui-native";
import { Lock, MapPin, Plus, Pencil, Trash2, X } from "lucide-react-native";
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

export default function SitesScreen() {
  return (
    <Container className="p-4">
      <Authenticated>
        <SitesContent />
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

function SitesContent() {
  const sites = useQuery(api.sites.list, {});
  const createSite = useMutation(api.sites.create);
  const updateSite = useMutation(api.sites.update);
  const removeSite = useMutation(api.sites.remove);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingSite, setEditingSite] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    responsibleName: "",
    responsiblePhone: "",
  });

  const successColor = useThemeColor("success");
  const dangerColor = useThemeColor("danger");

  const resetForm = () => {
    setFormData({ name: "", address: "", responsibleName: "", responsiblePhone: "" });
    setEditingSite(null);
  };

  const openCreate = () => {
    resetForm();
    setModalVisible(true);
  };

  const openEdit = (site: any) => {
    setEditingSite(site);
    setFormData({
      name: site.name,
      address: site.address || "",
      responsibleName: site.responsibleName || "",
      responsiblePhone: site.responsiblePhone || "",
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      Alert.alert("Erro", "Nome é obrigatório");
      return;
    }

    try {
      if (editingSite) {
        await updateSite({
          id: editingSite._id,
          name: formData.name,
          address: formData.address || undefined,
          responsibleName: formData.responsibleName || undefined,
          responsiblePhone: formData.responsiblePhone || undefined,
        });
        Alert.alert("Sucesso", "Site atualizado");
      } else {
        await createSite({
          name: formData.name,
          address: formData.address || undefined,
          responsibleName: formData.responsibleName || undefined,
          responsiblePhone: formData.responsiblePhone || undefined,
        });
        Alert.alert("Sucesso", "Site criado");
      }
      setModalVisible(false);
      resetForm();
    } catch (error: any) {
      Alert.alert("Erro", error.message || "Erro ao salvar");
    }
  };

  const handleDelete = (site: any) => {
    Alert.alert(
      "Desativar Site",
      `Deseja desativar "${site.name}"?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Desativar",
          style: "destructive",
          onPress: async () => {
            try {
              await removeSite({ id: site._id });
              Alert.alert("Sucesso", "Site desativado");
            } catch (error: any) {
              Alert.alert("Erro", error.message || "Erro ao desativar");
            }
          },
        },
      ]
    );
  };

  if (!sites) {
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
          <Text className="text-xl font-semibold text-foreground">Sites</Text>
          <Text className="text-muted text-sm">{sites.length} cadastrados</Text>
        </View>
        <Button variant="primary" onPress={openCreate}>
          <Plus size={18} color="white" />
          <Button.Label>Novo</Button.Label>
        </Button>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {sites.length === 0 ? (
          <Surface variant="secondary" className="p-8 rounded-lg items-center">
            <MapPin size={48} color="#888" />
            <Text className="text-foreground font-medium mt-4">Nenhum Site</Text>
            <Text className="text-muted text-sm text-center mt-2">
              Cadastre o primeiro local de entrega
            </Text>
          </Surface>
        ) : (
          sites.map((site: any) => (
            <Surface key={site._id} variant="secondary" className="mb-3 rounded-lg p-4">
              <View className="flex-row items-start justify-between">
                <View className="flex-1">
                  <View className="flex-row items-center gap-2 mb-1">
                    <Text className="text-foreground font-semibold">{site.name}</Text>
                    <Chip
                      variant="secondary"
                      color={site.isActive ? "success" : "default"}
                      size="sm"
                    >
                      <Chip.Label>{site.isActive ? "Ativo" : "Inativo"}</Chip.Label>
                    </Chip>
                  </View>
                  {site.address && (
                    <Text className="text-muted text-sm mb-1">{site.address}</Text>
                  )}
                  <View className="mt-2 gap-1">
                    {site.responsibleName && (
                      <Text className="text-muted text-xs">
                        Responsável: {site.responsibleName}
                      </Text>
                    )}
                    {site.responsiblePhone && (
                      <Text className="text-muted text-xs">{site.responsiblePhone}</Text>
                    )}
                  </View>
                </View>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    className="p-2"
                    onPress={() => openEdit(site)}
                  >
                    <Pencil size={18} color={successColor} />
                  </TouchableOpacity>
                  {site.isActive && (
                    <TouchableOpacity
                      className="p-2"
                      onPress={() => handleDelete(site)}
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
                {editingSite ? "Editar Site" : "Novo Site"}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={24} color="#888" />
              </TouchableOpacity>
            </View>

            <View className="gap-4">
              <View>
                <Text className="text-muted text-xs mb-1">Nome do Site *</Text>
                <TextInput
                  className="bg-default/20 text-foreground rounded-lg px-3 py-3"
                  placeholder="Nome do local"
                  placeholderTextColor="#888"
                  value={formData.name}
                  onChangeText={(text) => setFormData({ ...formData, name: text })}
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

              <View>
                <Text className="text-muted text-xs mb-1">Nome do Responsável</Text>
                <TextInput
                  className="bg-default/20 text-foreground rounded-lg px-3 py-3"
                  placeholder="Nome do responsável"
                  placeholderTextColor="#888"
                  value={formData.responsibleName}
                  onChangeText={(text) => setFormData({ ...formData, responsibleName: text })}
                />
              </View>

              <View>
                <Text className="text-muted text-xs mb-1">Telefone do Responsável</Text>
                <TextInput
                  className="bg-default/20 text-foreground rounded-lg px-3 py-3"
                  placeholder="(00) 00000-0000"
                  placeholderTextColor="#888"
                  keyboardType="phone-pad"
                  value={formData.responsiblePhone}
                  onChangeText={(text) => setFormData({ ...formData, responsiblePhone: text })}
                />
              </View>

              <Button variant="primary" onPress={handleSave}>
                <Button.Label>{editingSite ? "Salvar" : "Criar"}</Button.Label>
              </Button>
            </View>
          </Surface>
        </View>
      </Modal>
    </>
  );
}
