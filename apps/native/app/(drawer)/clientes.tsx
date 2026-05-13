import { api } from "@rlpapp/backend/convex/_generated/api";
import { Authenticated, AuthLoading, Unauthenticated, useMutation, useQuery } from "convex/react";
import { Plus, Pencil, Lock, ToggleLeft, ToggleRight } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { Link } from "expo-router";

import { Container } from "@/components/container";
import { Button, ButtonText } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ClientesScreen() {
  return (
    <Container className="px-5 pt-4 pb-4">
      <Authenticated>
        <ClientesContent />
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

type FormData = {
  nome: string;
  email: string;
  phone: string;
  documento: string;
  endereco: string;
};

const emptyForm: FormData = { nome: "", email: "", phone: "", documento: "", endereco: "" };

function ClientesContent() {
  const clientes = useQuery(api.clientes.list, {});
  const createCliente = useMutation(api.clientes.create);
  const updateCliente = useMutation(api.clientes.update);
  const toggleActive = useMutation(api.clientes.toggleActive);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<any>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm);

  const resetForm = () => setFormData(emptyForm);

  const handleCreate = async () => {
    try {
      await createCliente({
        nome: formData.nome,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        documento: formData.documento || undefined,
        endereco: formData.endereco || undefined,
      });
      setIsCreateOpen(false);
      resetForm();
    } catch (e: any) {
      Alert.alert("Erro", e.message ?? "Erro ao criar cliente");
    }
  };

  const handleUpdate = async () => {
    if (!editingCliente) return;
    try {
      await updateCliente({
        id: editingCliente._id,
        nome: formData.nome || undefined,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        documento: formData.documento || undefined,
        endereco: formData.endereco || undefined,
      });
      setEditingCliente(null);
      resetForm();
    } catch (e: any) {
      Alert.alert("Erro", e.message ?? "Erro ao atualizar cliente");
    }
  };

  const handleToggle = (id: any) => {
    Alert.alert("Confirmar", "Deseja alterar o status deste cliente?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Confirmar",
        onPress: async () => {
          try {
            await toggleActive({ id });
          } catch (e: any) {
            Alert.alert("Erro", e.message);
          }
        },
      },
    ]);
  };

  const openEdit = (cliente: any) => {
    setEditingCliente(cliente);
    setFormData({
      nome: cliente.nome,
      email: cliente.email ?? "",
      phone: cliente.phone ?? "",
      documento: cliente.documento ?? "",
      endereco: cliente.endereco ?? "",
    });
  };

  const set = (field: keyof FormData) => (t: string) =>
    setFormData((f) => ({ ...f, [field]: t }));

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-2xl font-bold text-foreground">Clientes</Text>
          <Text className="text-muted-foreground text-sm">Gerencie seus clientes</Text>
        </View>
        <Button onPress={() => { resetForm(); setIsCreateOpen(true); }}>
          <View className="flex-row items-center gap-1">
            <Plus size={16} color="#fff" />
            <ButtonText>Novo</ButtonText>
          </View>
        </Button>
      </View>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogHeader>
          <DialogTitle>Novo Cliente</DialogTitle>
          <DialogDescription>Preencha os dados do cliente</DialogDescription>
        </DialogHeader>
        <ClienteFormFields formData={formData} set={set} />
        <DialogFooter>
          <Button variant="outline" onPress={() => setIsCreateOpen(false)}>
            <ButtonText variant="outline">Cancelar</ButtonText>
          </Button>
          <Button onPress={handleCreate}><ButtonText>Criar</ButtonText></Button>
        </DialogFooter>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingCliente} onOpenChange={(open) => !open && setEditingCliente(null)}>
        <DialogHeader>
          <DialogTitle>Editar Cliente</DialogTitle>
          <DialogDescription>Atualize os dados do cliente</DialogDescription>
        </DialogHeader>
        <ClienteFormFields formData={formData} set={set} />
        <DialogFooter>
          <Button variant="outline" onPress={() => setEditingCliente(null)}>
            <ButtonText variant="outline">Cancelar</ButtonText>
          </Button>
          <Button onPress={handleUpdate}><ButtonText>Salvar</ButtonText></Button>
        </DialogFooter>
      </Dialog>

      {/* List */}
      <Card>
        <CardHeader><CardTitle>Lista de Clientes</CardTitle></CardHeader>
        <CardContent>
          {!clientes ? (
            <ActivityIndicator />
          ) : clientes.length === 0 ? (
            <Text className="text-muted-foreground text-center py-4">Nenhum cliente cadastrado</Text>
          ) : (
            <View className="gap-3">
              {clientes.map((cliente) => (
                <View key={cliente._id} className="flex-row items-center justify-between rounded-lg border border-border p-3">
                  <View className="flex-1">
                    <Text className="text-foreground font-medium">{cliente.nome}</Text>
                    <Text className="text-muted-foreground text-xs mt-0.5">
                      {cliente.documento || "Sem documento"} • {cliente.email || "Sem email"}
                    </Text>
                    {cliente.phone ? (
                      <Text className="text-muted-foreground text-xs mt-0.5">{cliente.phone}</Text>
                    ) : null}
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Badge variant={cliente.isActive ? "success" : "secondary"}>
                      {cliente.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                    <Pressable onPress={() => openEdit(cliente)} className="p-2">
                      <Pencil size={16} color="#666" />
                    </Pressable>
                    <Pressable onPress={() => handleToggle(cliente._id)} className="p-2">
                      {cliente.isActive ? (
                        <ToggleRight size={20} color="#10b981" />
                      ) : (
                        <ToggleLeft size={20} color="#9ca3af" />
                      )}
                    </Pressable>
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

function ClienteFormFields({
  formData,
  set,
}: {
  formData: FormData;
  set: (field: keyof FormData) => (t: string) => void;
}) {
  return (
    <View className="gap-3 mt-3">
      <View className="gap-1">
        <Label>Nome</Label>
        <Input value={formData.nome} onChangeText={set("nome")} placeholder="Nome completo" />
      </View>
      <View className="gap-1">
        <Label>Documento (CPF/CNPJ)</Label>
        <Input value={formData.documento} onChangeText={set("documento")} placeholder="000.000.000-00" />
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1 gap-1">
          <Label>Email</Label>
          <Input value={formData.email} onChangeText={set("email")} keyboardType="email-address" placeholder="email@exemplo.com" />
        </View>
        <View className="flex-1 gap-1">
          <Label>Telefone</Label>
          <Input value={formData.phone} onChangeText={set("phone")} keyboardType="phone-pad" placeholder="(00) 00000-0000" />
        </View>
      </View>
      <View className="gap-1">
        <Label>Endereço</Label>
        <Input value={formData.endereco} onChangeText={set("endereco")} placeholder="Rua, número, cidade" />
      </View>
    </View>
  );
}
