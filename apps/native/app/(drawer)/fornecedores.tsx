import { api } from "@rlpapp/backend/convex/_generated/api";
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

export default function FornecedoresScreen() {
  return (
    <Container className="px-5 pt-4 pb-4">
      <Authenticated>
        <FornecedoresContent />
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

function FornecedoresContent() {
  const suppliers = useQuery(api.suppliers.list, {});
  const createSupplier = useMutation(api.suppliers.create);
  const updateSupplier = useMutation(api.suppliers.update);
  const removeSupplier = useMutation(api.suppliers.remove);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);

  const [formData, setFormData] = useState({
    name: "",
    contactName: "",
    email: "",
    phone: "",
    address: "",
  });

  const resetForm = () => {
    setFormData({ name: "", contactName: "", email: "", phone: "", address: "" });
  };

  const handleCreate = async () => {
    try {
      await createSupplier({
        name: formData.name,
        contactName: formData.contactName || undefined,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        address: formData.address || undefined,
      });
      setIsCreateOpen(false);
      resetForm();
    } catch (error) {
      Alert.alert("Erro", "Erro ao criar fornecedor");
    }
  };

  const handleUpdate = async () => {
    if (!editingSupplier) return;
    try {
      await updateSupplier({
        id: editingSupplier._id,
        name: formData.name,
        contactName: formData.contactName || undefined,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        address: formData.address || undefined,
      });
      setEditingSupplier(null);
      resetForm();
    } catch (error) {
      Alert.alert("Erro", "Erro ao atualizar fornecedor");
    }
  };

  const handleDelete = (id: any) => {
    Alert.alert("Confirmar", "Deseja realmente desativar este fornecedor?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Desativar",
        style: "destructive",
        onPress: async () => {
          try {
            await removeSupplier({ id });
          } catch (error) {
            Alert.alert("Erro", "Erro ao desativar fornecedor");
          }
        },
      },
    ]);
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
  };

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-2xl font-bold text-foreground">Fornecedores</Text>
          <Text className="text-muted-foreground text-sm">Gerencie os fornecedores</Text>
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
          <DialogTitle>Novo Fornecedor</DialogTitle>
          <DialogDescription>Preencha os dados do fornecedor</DialogDescription>
        </DialogHeader>
        <View className="gap-3 mt-3">
          <View className="gap-1">
            <Label>Nome da Empresa</Label>
            <Input value={formData.name} onChangeText={(t) => setFormData((f) => ({ ...f, name: t }))} />
          </View>
          <View className="gap-1">
            <Label>Nome do Contato</Label>
            <Input value={formData.contactName} onChangeText={(t) => setFormData((f) => ({ ...f, contactName: t }))} />
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1 gap-1">
              <Label>Email</Label>
              <Input value={formData.email} onChangeText={(t) => setFormData((f) => ({ ...f, email: t }))} keyboardType="email-address" />
            </View>
            <View className="flex-1 gap-1">
              <Label>Telefone</Label>
              <Input value={formData.phone} onChangeText={(t) => setFormData((f) => ({ ...f, phone: t }))} keyboardType="phone-pad" />
            </View>
          </View>
          <View className="gap-1">
            <Label>Endereço</Label>
            <Input value={formData.address} onChangeText={(t) => setFormData((f) => ({ ...f, address: t }))} />
          </View>
        </View>
        <DialogFooter>
          <Button variant="outline" onPress={() => setIsCreateOpen(false)}>
            <ButtonText variant="outline">Cancelar</ButtonText>
          </Button>
          <Button onPress={handleCreate}><ButtonText>Criar</ButtonText></Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={!!editingSupplier} onOpenChange={(open) => !open && setEditingSupplier(null)}>
        <DialogHeader>
          <DialogTitle>Editar Fornecedor</DialogTitle>
          <DialogDescription>Atualize os dados do fornecedor</DialogDescription>
        </DialogHeader>
        <View className="gap-3 mt-3">
          <View className="gap-1">
            <Label>Nome da Empresa</Label>
            <Input value={formData.name} onChangeText={(t) => setFormData((f) => ({ ...f, name: t }))} />
          </View>
          <View className="gap-1">
            <Label>Nome do Contato</Label>
            <Input value={formData.contactName} onChangeText={(t) => setFormData((f) => ({ ...f, contactName: t }))} />
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1 gap-1">
              <Label>Email</Label>
              <Input value={formData.email} onChangeText={(t) => setFormData((f) => ({ ...f, email: t }))} keyboardType="email-address" />
            </View>
            <View className="flex-1 gap-1">
              <Label>Telefone</Label>
              <Input value={formData.phone} onChangeText={(t) => setFormData((f) => ({ ...f, phone: t }))} keyboardType="phone-pad" />
            </View>
          </View>
          <View className="gap-1">
            <Label>Endereço</Label>
            <Input value={formData.address} onChangeText={(t) => setFormData((f) => ({ ...f, address: t }))} />
          </View>
        </View>
        <DialogFooter>
          <Button variant="outline" onPress={() => setEditingSupplier(null)}>
            <ButtonText variant="outline">Cancelar</ButtonText>
          </Button>
          <Button onPress={handleUpdate}><ButtonText>Salvar</ButtonText></Button>
        </DialogFooter>
      </Dialog>

      <Card>
        <CardHeader><CardTitle>Lista de Fornecedores</CardTitle></CardHeader>
        <CardContent>
          {!suppliers ? (
            <ActivityIndicator />
          ) : suppliers.length === 0 ? (
            <Text className="text-muted-foreground">Nenhum fornecedor cadastrado</Text>
          ) : (
            <View className="gap-3">
              {suppliers.map((supplier) => (
                <View key={supplier._id} className="flex-row items-center justify-between rounded-lg border border-border p-3">
                  <View className="flex-1">
                    <Text className="text-foreground font-medium">{supplier.name}</Text>
                    <Text className="text-muted-foreground text-xs mt-0.5">
                      {supplier.contactName || "Sem contato"} • {supplier.email || "Sem email"}
                    </Text>
                    {supplier.phone ? (
                      <Text className="text-muted-foreground text-xs mt-0.5">{supplier.phone}</Text>
                    ) : null}
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Badge variant={supplier.isActive ? "success" : "secondary"}>
                      {supplier.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                    <Pressable onPress={() => openEdit(supplier)} className="p-2">
                      <Pencil size={16} color="#666" />
                    </Pressable>
                    {supplier.isActive && (
                      <Pressable onPress={() => handleDelete(supplier._id)} className="p-2">
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
