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
import { Select } from "@/components/ui/select";

const TIPO_OPTIONS = [
  { label: "Despesa", value: "despesa" },
  { label: "Receita", value: "receita" },
  { label: "Ambos", value: "ambos" },
];

const tipoLabel = (tipo: string) => {
  switch (tipo) {
    case "despesa": return "Despesa";
    case "receita": return "Receita";
    case "ambos": return "Ambos";
    default: return tipo;
  }
};

const tipoVariant = (tipo: string) => {
  switch (tipo) {
    case "despesa": return "destructive" as const;
    case "receita": return "success" as const;
    case "ambos": return "default" as const;
    default: return "secondary" as const;
  }
};

export default function CategoriasScreen() {
  return (
    <Container className="px-5 pt-4 pb-4">
      <Authenticated>
        <CategoriasContent />
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
  tipo: string;
  cor: string;
};

const emptyForm: FormData = { nome: "", tipo: "", cor: "" };

function CategoriasContent() {
  const categorias = useQuery(api.categoriasFinanceiras.list, {});
  const createCategoria = useMutation(api.categoriasFinanceiras.create);
  const updateCategoria = useMutation(api.categoriasFinanceiras.update);
  const toggleActive = useMutation(api.categoriasFinanceiras.toggleActive);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCategoria, setEditingCategoria] = useState<any>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm);

  const resetForm = () => setFormData(emptyForm);

  const handleCreate = async () => {
    try {
      await createCategoria({
        nome: formData.nome,
        tipo: formData.tipo as any,
        cor: formData.cor || undefined,
      });
      setIsCreateOpen(false);
      resetForm();
    } catch (e: any) {
      Alert.alert("Erro", e.message ?? "Erro ao criar categoria");
    }
  };

  const handleUpdate = async () => {
    if (!editingCategoria) return;
    try {
      await updateCategoria({
        id: editingCategoria._id,
        nome: formData.nome || undefined,
        tipo: formData.tipo ? (formData.tipo as any) : undefined,
        cor: formData.cor || undefined,
      });
      setEditingCategoria(null);
      resetForm();
    } catch (e: any) {
      Alert.alert("Erro", e.message ?? "Erro ao atualizar categoria");
    }
  };

  const handleToggle = (id: any) => {
    Alert.alert("Confirmar", "Deseja alterar o status desta categoria?", [
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

  const openEdit = (categoria: any) => {
    setEditingCategoria(categoria);
    setFormData({
      nome: categoria.nome,
      tipo: categoria.tipo,
      cor: categoria.cor ?? "",
    });
  };

  const set = (field: keyof FormData) => (t: string) =>
    setFormData((f) => ({ ...f, [field]: t }));

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-2xl font-bold text-foreground">Categorias</Text>
          <Text className="text-muted-foreground text-sm">Categorias financeiras</Text>
        </View>
        <Button onPress={() => { resetForm(); setIsCreateOpen(true); }}>
          <View className="flex-row items-center gap-1">
            <Plus size={16} color="#fff" />
            <ButtonText>Nova</ButtonText>
          </View>
        </Button>
      </View>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogHeader>
          <DialogTitle>Nova Categoria</DialogTitle>
          <DialogDescription>Preencha os dados da categoria</DialogDescription>
        </DialogHeader>
        <View className="gap-3 mt-3">
          <View className="gap-1">
            <Label>Nome</Label>
            <Input value={formData.nome} onChangeText={set("nome")} placeholder="Nome da categoria" />
          </View>
          <View className="gap-1">
            <Label>Tipo</Label>
            <Select value={formData.tipo} onValueChange={set("tipo")} options={TIPO_OPTIONS} placeholder="Selecione o tipo" />
          </View>
          <View className="gap-1">
            <Label>Cor (hex)</Label>
            <Input value={formData.cor} onChangeText={set("cor")} placeholder="#3b82f6" />
          </View>
        </View>
        <DialogFooter>
          <Button variant="outline" onPress={() => setIsCreateOpen(false)}>
            <ButtonText variant="outline">Cancelar</ButtonText>
          </Button>
          <Button onPress={handleCreate}><ButtonText>Criar</ButtonText></Button>
        </DialogFooter>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingCategoria} onOpenChange={(open) => !open && setEditingCategoria(null)}>
        <DialogHeader>
          <DialogTitle>Editar Categoria</DialogTitle>
          <DialogDescription>Atualize os dados da categoria</DialogDescription>
        </DialogHeader>
        <View className="gap-3 mt-3">
          <View className="gap-1">
            <Label>Nome</Label>
            <Input value={formData.nome} onChangeText={set("nome")} />
          </View>
          <View className="gap-1">
            <Label>Tipo</Label>
            <Select value={formData.tipo} onValueChange={set("tipo")} options={TIPO_OPTIONS} placeholder="Selecione o tipo" />
          </View>
          <View className="gap-1">
            <Label>Cor (hex)</Label>
            <Input value={formData.cor} onChangeText={set("cor")} placeholder="#3b82f6" />
          </View>
        </View>
        <DialogFooter>
          <Button variant="outline" onPress={() => setEditingCategoria(null)}>
            <ButtonText variant="outline">Cancelar</ButtonText>
          </Button>
          <Button onPress={handleUpdate}><ButtonText>Salvar</ButtonText></Button>
        </DialogFooter>
      </Dialog>

      {/* List */}
      <Card>
        <CardHeader><CardTitle>Lista de Categorias</CardTitle></CardHeader>
        <CardContent>
          {!categorias ? (
            <ActivityIndicator />
          ) : categorias.length === 0 ? (
            <Text className="text-muted-foreground text-center py-4">Nenhuma categoria cadastrada</Text>
          ) : (
            <View className="gap-3">
              {categorias.map((cat) => (
                <View key={cat._id} className="flex-row items-center justify-between rounded-lg border border-border p-3">
                  <View className="flex-row items-center gap-3 flex-1">
                    <View
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: cat.cor ?? "#9ca3af" }}
                    />
                    <View className="flex-1">
                      <Text className="text-foreground font-medium">{cat.nome}</Text>
                      <View className="flex-row items-center gap-2 mt-0.5">
                        <Badge variant={tipoVariant(cat.tipo)}>{tipoLabel(cat.tipo)}</Badge>
                      </View>
                    </View>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Badge variant={cat.isActive ? "success" : "secondary"}>
                      {cat.isActive ? "Ativa" : "Inativa"}
                    </Badge>
                    <Pressable onPress={() => openEdit(cat)} className="p-2">
                      <Pencil size={16} color="#666" />
                    </Pressable>
                    <Pressable onPress={() => handleToggle(cat._id)} className="p-2">
                      {cat.isActive ? (
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
