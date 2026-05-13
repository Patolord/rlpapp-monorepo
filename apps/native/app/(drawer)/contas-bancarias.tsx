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

function formatCurrency(valueInCents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valueInCents / 100);
}

function parseCurrency(text: string): number {
  const cleaned = text.replace(/[^\d,]/g, "").replace(",", ".");
  return Math.round(parseFloat(cleaned) * 100) || 0;
}

const TIPO_CONTA_OPTIONS = [
  { label: "Corrente", value: "corrente" },
  { label: "Poupança", value: "poupanca" },
];

export default function ContasBancariasScreen() {
  return (
    <Container className="px-5 pt-4 pb-4">
      <Authenticated>
        <ContasBancariasContent />
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
  banco: string;
  agencia: string;
  conta: string;
  tipo: string;
  saldoInicial: string;
};

const emptyForm: FormData = { nome: "", banco: "", agencia: "", conta: "", tipo: "", saldoInicial: "" };

function ContasBancariasContent() {
  const contasBancarias = useQuery(api.contasBancarias.list, {});
  const createConta = useMutation(api.contasBancarias.create);
  const updateConta = useMutation(api.contasBancarias.update);
  const toggleActive = useMutation(api.contasBancarias.toggleActive);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingConta, setEditingConta] = useState<any>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm);

  const resetForm = () => setFormData(emptyForm);

  const handleCreate = async () => {
    try {
      await createConta({
        nome: formData.nome,
        banco: formData.banco,
        agencia: formData.agencia,
        conta: formData.conta,
        tipo: formData.tipo as any,
        saldoInicial: parseCurrency(formData.saldoInicial),
      });
      setIsCreateOpen(false);
      resetForm();
    } catch (e: any) {
      Alert.alert("Erro", e.message ?? "Erro ao criar conta bancária");
    }
  };

  const handleUpdate = async () => {
    if (!editingConta) return;
    try {
      await updateConta({
        id: editingConta._id,
        nome: formData.nome || undefined,
        banco: formData.banco || undefined,
        agencia: formData.agencia || undefined,
        conta: formData.conta || undefined,
        tipo: formData.tipo ? (formData.tipo as any) : undefined,
        saldoInicial: formData.saldoInicial ? parseCurrency(formData.saldoInicial) : undefined,
      });
      setEditingConta(null);
      resetForm();
    } catch (e: any) {
      Alert.alert("Erro", e.message ?? "Erro ao atualizar conta bancária");
    }
  };

  const handleToggle = (id: any) => {
    Alert.alert("Confirmar", "Deseja alterar o status desta conta bancária?", [
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

  const openEdit = (conta: any) => {
    setEditingConta(conta);
    setFormData({
      nome: conta.nome,
      banco: conta.banco,
      agencia: conta.agencia,
      conta: conta.conta,
      tipo: conta.tipo,
      saldoInicial: (conta.saldoInicial / 100).toFixed(2).replace(".", ","),
    });
  };

  const set = (field: keyof FormData) => (t: string) =>
    setFormData((f) => ({ ...f, [field]: t }));

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-2xl font-bold text-foreground">Contas Bancárias</Text>
          <Text className="text-muted-foreground text-sm">Gerencie suas contas</Text>
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
          <DialogTitle>Nova Conta Bancária</DialogTitle>
          <DialogDescription>Preencha os dados da conta</DialogDescription>
        </DialogHeader>
        <ContaBancariaFormFields formData={formData} set={set} />
        <DialogFooter>
          <Button variant="outline" onPress={() => setIsCreateOpen(false)}>
            <ButtonText variant="outline">Cancelar</ButtonText>
          </Button>
          <Button onPress={handleCreate}><ButtonText>Criar</ButtonText></Button>
        </DialogFooter>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingConta} onOpenChange={(open) => !open && setEditingConta(null)}>
        <DialogHeader>
          <DialogTitle>Editar Conta Bancária</DialogTitle>
          <DialogDescription>Atualize os dados da conta</DialogDescription>
        </DialogHeader>
        <ContaBancariaFormFields formData={formData} set={set} />
        <DialogFooter>
          <Button variant="outline" onPress={() => setEditingConta(null)}>
            <ButtonText variant="outline">Cancelar</ButtonText>
          </Button>
          <Button onPress={handleUpdate}><ButtonText>Salvar</ButtonText></Button>
        </DialogFooter>
      </Dialog>

      {/* List */}
      <Card>
        <CardHeader><CardTitle>Lista de Contas Bancárias</CardTitle></CardHeader>
        <CardContent>
          {!contasBancarias ? (
            <ActivityIndicator />
          ) : contasBancarias.length === 0 ? (
            <Text className="text-muted-foreground text-center py-4">Nenhuma conta bancária cadastrada</Text>
          ) : (
            <View className="gap-3">
              {contasBancarias.map((conta) => (
                <View key={conta._id} className="flex-row items-center justify-between rounded-lg border border-border p-3">
                  <View className="flex-1">
                    <Text className="text-foreground font-medium">{conta.nome}</Text>
                    <Text className="text-muted-foreground text-xs mt-0.5">
                      {conta.banco} • Ag: {conta.agencia} • Cc: {conta.conta}
                    </Text>
                    <View className="flex-row items-center gap-2 mt-1">
                      <Badge variant={conta.tipo === "corrente" ? "default" : "secondary"}>
                        {conta.tipo === "corrente" ? "Corrente" : "Poupança"}
                      </Badge>
                      <Text className="text-xs text-muted-foreground">
                        Saldo inicial: {formatCurrency(conta.saldoInicial)}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Badge variant={conta.isActive ? "success" : "secondary"}>
                      {conta.isActive ? "Ativa" : "Inativa"}
                    </Badge>
                    <Pressable onPress={() => openEdit(conta)} className="p-2">
                      <Pencil size={16} color="#666" />
                    </Pressable>
                    <Pressable onPress={() => handleToggle(conta._id)} className="p-2">
                      {conta.isActive ? (
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

function ContaBancariaFormFields({
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
        <Input value={formData.nome} onChangeText={set("nome")} placeholder="Ex: Conta Principal" />
      </View>
      <View className="gap-1">
        <Label>Banco</Label>
        <Input value={formData.banco} onChangeText={set("banco")} placeholder="Ex: Banco do Brasil" />
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1 gap-1">
          <Label>Agência</Label>
          <Input value={formData.agencia} onChangeText={set("agencia")} placeholder="0001" />
        </View>
        <View className="flex-1 gap-1">
          <Label>Conta</Label>
          <Input value={formData.conta} onChangeText={set("conta")} placeholder="12345-6" />
        </View>
      </View>
      <View className="gap-1">
        <Label>Tipo</Label>
        <Select value={formData.tipo} onValueChange={set("tipo")} options={TIPO_CONTA_OPTIONS} placeholder="Selecione o tipo" />
      </View>
      <View className="gap-1">
        <Label>Saldo Inicial (R$)</Label>
        <Input value={formData.saldoInicial} onChangeText={set("saldoInicial")} keyboardType="numeric" placeholder="0,00" />
      </View>
    </View>
  );
}
