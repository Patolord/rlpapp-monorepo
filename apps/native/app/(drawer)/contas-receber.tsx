import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { Authenticated, AuthLoading, Unauthenticated, useMutation, useQuery } from "convex/react";
import {
  Plus,
  Pencil,
  Lock,
  Search,
  Ban,
  Banknote,
} from "lucide-react-native";
import { useState, useMemo } from "react";
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

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("pt-BR").format(timestamp);
}

function parseCurrency(text: string): number {
  const cleaned = text.replace(/[^\d,]/g, "").replace(",", ".");
  return Math.round(parseFloat(cleaned) * 100) || 0;
}

const STATUS_OPTIONS = [
  { label: "Todos", value: "" },
  { label: "Emitido", value: "Emitido" },
  { label: "Parcial", value: "Parcial" },
  { label: "Recebido", value: "Recebido" },
  { label: "Vencido", value: "Vencido" },
  { label: "Cancelado", value: "Cancelado" },
];

const FORMA_PAGAMENTO_OPTIONS = [
  { label: "PIX", value: "pix" },
  { label: "TED", value: "ted" },
  { label: "Boleto", value: "boleto" },
  { label: "Dinheiro", value: "dinheiro" },
  { label: "Cartão", value: "cartao" },
];

const statusVariant = (status: string) => {
  switch (status) {
    case "Emitido": return "default" as const;
    case "Parcial": return "warning" as const;
    case "Recebido": return "success" as const;
    case "Vencido": return "destructive" as const;
    case "Cancelado": return "secondary" as const;
    default: return "outline" as const;
  }
};

export default function ContasReceberScreen() {
  return (
    <Container className="px-5 pt-4 pb-4">
      <Authenticated>
        <ContasReceberContent />
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
  descricao: string;
  valor: string;
  dataVencimento: string;
  dataCompetencia: string;
  dataEmissao: string;
  categoriaId: string;
  clienteId: string;
  contaBancariaId: string;
  formaPagamento: string;
  notaFiscal: string;
  observacoes: string;
};

const emptyForm: FormData = {
  descricao: "",
  valor: "",
  dataVencimento: "",
  dataCompetencia: "",
  dataEmissao: "",
  categoriaId: "",
  clienteId: "",
  contaBancariaId: "",
  formaPagamento: "",
  notaFiscal: "",
  observacoes: "",
};

function ContasReceberContent() {
  const contas = useQuery(api.contasReceber.list, {});
  const categorias = useQuery(api.categoriasFinanceiras.list, {});
  const clientes = useQuery(api.clientes.list, {});
  const contasBancarias = useQuery(api.contasBancarias.list, {});

  const createConta = useMutation(api.contasReceber.create);
  const updateConta = useMutation(api.contasReceber.update);
  const receberConta = useMutation(api.contasReceber.registrarRecebimento);
  const cancelarConta = useMutation(api.contasReceber.cancelar);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<Id<"contasReceber"> | null>(null);
  const [receivingId, setReceivingId] = useState<Id<"contasReceber"> | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [receiveForm, setReceiveForm] = useState({
    valorRecebido: "",
    dataRecebimento: "",
    formaPagamento: "",
    contaBancariaId: "",
  });

  const categoriaOptions = useMemo(
    () => (categorias ?? []).filter((c) => c.isActive).map((c) => ({ label: c.nome, value: c._id })),
    [categorias],
  );
  const clienteOptions = useMemo(
    () => (clientes ?? []).filter((c) => c.isActive).map((c) => ({ label: c.nome, value: c._id })),
    [clientes],
  );
  const contaBancariaOptions = useMemo(
    () => (contasBancarias ?? []).filter((c) => c.isActive).map((c) => ({ label: `${c.nome} - ${c.banco}`, value: c._id })),
    [contasBancarias],
  );

  const filtered = useMemo(() => {
    if (!contas) return [];
    return contas.filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (search) {
        const term = search.toLowerCase();
        const matchDesc = c.descricao.toLowerCase().includes(term);
        const matchCliente = c.cliente?.nome?.toLowerCase().includes(term);
        if (!matchDesc && !matchCliente) return false;
      }
      return true;
    });
  }, [contas, statusFilter, search]);

  const resetForm = () => setFormData(emptyForm);

  const handleCreate = async () => {
    try {
      await createConta({
        descricao: formData.descricao,
        valor: parseCurrency(formData.valor),
        dataVencimento: formData.dataVencimento ? new Date(formData.dataVencimento).getTime() : Date.now(),
        dataCompetencia: formData.dataCompetencia ? new Date(formData.dataCompetencia).getTime() : Date.now(),
        dataEmissao: formData.dataEmissao ? new Date(formData.dataEmissao).getTime() : Date.now(),
        categoriaId: formData.categoriaId ? (formData.categoriaId as Id<"categoriasFinanceiras">) : undefined,
        clienteId: formData.clienteId ? (formData.clienteId as Id<"clientes">) : undefined,
        contaBancariaId: formData.contaBancariaId ? (formData.contaBancariaId as Id<"contasBancarias">) : undefined,
        formaPagamento: formData.formaPagamento ? (formData.formaPagamento as any) : undefined,
        notaFiscal: formData.notaFiscal || undefined,
        observacoes: formData.observacoes || undefined,
      });
      setIsCreateOpen(false);
      resetForm();
    } catch (e: any) {
      Alert.alert("Erro", e.message ?? "Erro ao criar conta");
    }
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    try {
      await updateConta({
        id: editingId,
        descricao: formData.descricao || undefined,
        valor: formData.valor ? parseCurrency(formData.valor) : undefined,
        dataVencimento: formData.dataVencimento ? new Date(formData.dataVencimento).getTime() : undefined,
        dataCompetencia: formData.dataCompetencia ? new Date(formData.dataCompetencia).getTime() : undefined,
        dataEmissao: formData.dataEmissao ? new Date(formData.dataEmissao).getTime() : undefined,
        categoriaId: formData.categoriaId ? (formData.categoriaId as Id<"categoriasFinanceiras">) : undefined,
        clienteId: formData.clienteId ? (formData.clienteId as Id<"clientes">) : undefined,
        contaBancariaId: formData.contaBancariaId ? (formData.contaBancariaId as Id<"contasBancarias">) : undefined,
        formaPagamento: formData.formaPagamento ? (formData.formaPagamento as any) : undefined,
        notaFiscal: formData.notaFiscal || undefined,
        observacoes: formData.observacoes || undefined,
      });
      setEditingId(null);
      resetForm();
    } catch (e: any) {
      Alert.alert("Erro", e.message ?? "Erro ao atualizar conta");
    }
  };

  const handleReceive = async () => {
    if (!receivingId) return;
    try {
      await receberConta({
        id: receivingId,
        valorRecebido: parseCurrency(receiveForm.valorRecebido),
        dataRecebimento: receiveForm.dataRecebimento ? new Date(receiveForm.dataRecebimento).getTime() : undefined,
        formaPagamento: receiveForm.formaPagamento ? (receiveForm.formaPagamento as any) : undefined,
        contaBancariaId: receiveForm.contaBancariaId ? (receiveForm.contaBancariaId as Id<"contasBancarias">) : undefined,
      });
      setReceivingId(null);
      setReceiveForm({ valorRecebido: "", dataRecebimento: "", formaPagamento: "", contaBancariaId: "" });
    } catch (e: any) {
      Alert.alert("Erro", e.message ?? "Erro ao registrar recebimento");
    }
  };

  const openEdit = (conta: any) => {
    setEditingId(conta._id);
    setFormData({
      descricao: conta.descricao,
      valor: (conta.valor / 100).toFixed(2).replace(".", ","),
      dataVencimento: new Date(conta.dataVencimento).toISOString().split("T")[0],
      dataCompetencia: conta.dataCompetencia ? new Date(conta.dataCompetencia).toISOString().split("T")[0] : "",
      dataEmissao: conta.dataEmissao ? new Date(conta.dataEmissao).toISOString().split("T")[0] : "",
      categoriaId: conta.categoriaId ?? "",
      clienteId: conta.clienteId ?? "",
      contaBancariaId: conta.contaBancariaId ?? "",
      formaPagamento: conta.formaPagamento ?? "",
      notaFiscal: conta.notaFiscal ?? "",
      observacoes: conta.observacoes ?? "",
    });
  };

  const openReceive = (conta: any) => {
    const saldo = conta.valor - conta.valorRecebido;
    setReceivingId(conta._id);
    setReceiveForm({
      valorRecebido: (saldo / 100).toFixed(2).replace(".", ","),
      dataRecebimento: "",
      formaPagamento: conta.formaPagamento ?? "",
      contaBancariaId: conta.contaBancariaId ?? "",
    });
  };

  const handleCancelar = (id: Id<"contasReceber">) => {
    Alert.alert("Cancelar Conta", "Deseja cancelar esta conta?", [
      { text: "Não", style: "cancel" },
      {
        text: "Sim, cancelar",
        style: "destructive",
        onPress: async () => {
          try {
            await cancelarConta({ id });
          } catch (e: any) {
            Alert.alert("Erro", e.message);
          }
        },
      },
    ]);
  };

  const set = (field: keyof FormData) => (t: string) =>
    setFormData((f) => ({ ...f, [field]: t }));

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-2xl font-bold text-foreground">Contas a Receber</Text>
          <Text className="text-muted-foreground text-sm">Gerencie seus recebíveis</Text>
        </View>
        <Button onPress={() => { resetForm(); setIsCreateOpen(true); }}>
          <View className="flex-row items-center gap-1">
            <Plus size={16} color="#fff" />
            <ButtonText>Nova Conta</ButtonText>
          </View>
        </Button>
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <View className="flex-row items-center border border-input rounded-md bg-card px-3 h-10">
            <Search size={16} color="#9ca3af" />
            <Input className="flex-1 border-0 h-10" placeholder="Buscar..." value={search} onChangeText={setSearch} />
          </View>
        </View>
        <View style={{ width: 140 }}>
          <Select value={statusFilter} onValueChange={setStatusFilter} options={STATUS_OPTIONS} placeholder="Status" />
        </View>
      </View>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogHeader>
          <DialogTitle>Nova Conta a Receber</DialogTitle>
          <DialogDescription>Preencha os dados da conta</DialogDescription>
        </DialogHeader>
        <View className="gap-3 mt-3">
          <View className="gap-1">
            <Label>Descrição</Label>
            <Input value={formData.descricao} onChangeText={set("descricao")} placeholder="Ex: Serviço prestado" />
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1 gap-1">
              <Label>Valor (R$)</Label>
              <Input value={formData.valor} onChangeText={set("valor")} keyboardType="numeric" placeholder="0,00" />
            </View>
            <View className="flex-1 gap-1">
              <Label>Vencimento</Label>
              <Input value={formData.dataVencimento} onChangeText={set("dataVencimento")} placeholder="AAAA-MM-DD" />
            </View>
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1 gap-1">
              <Label>Competência</Label>
              <Input value={formData.dataCompetencia} onChangeText={set("dataCompetencia")} placeholder="AAAA-MM-DD" />
            </View>
            <View className="flex-1 gap-1">
              <Label>Emissão</Label>
              <Input value={formData.dataEmissao} onChangeText={set("dataEmissao")} placeholder="AAAA-MM-DD" />
            </View>
          </View>
          <View className="gap-1">
            <Label>Cliente</Label>
            <Select value={formData.clienteId} onValueChange={set("clienteId")} options={clienteOptions} placeholder="Selecione..." />
          </View>
          <View className="gap-1">
            <Label>Categoria</Label>
            <Select value={formData.categoriaId} onValueChange={set("categoriaId")} options={categoriaOptions} placeholder="Selecione..." />
          </View>
          <View className="gap-1">
            <Label>Conta Bancária</Label>
            <Select value={formData.contaBancariaId} onValueChange={set("contaBancariaId")} options={contaBancariaOptions} placeholder="Selecione..." />
          </View>
          <View className="gap-1">
            <Label>Forma de Pagamento</Label>
            <Select value={formData.formaPagamento} onValueChange={set("formaPagamento")} options={FORMA_PAGAMENTO_OPTIONS} placeholder="Selecione..." />
          </View>
          <View className="gap-1">
            <Label>Nota Fiscal</Label>
            <Input value={formData.notaFiscal} onChangeText={set("notaFiscal")} placeholder="Número da NF" />
          </View>
          <View className="gap-1">
            <Label>Observações</Label>
            <Input value={formData.observacoes} onChangeText={set("observacoes")} placeholder="Observações..." multiline />
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
      <Dialog open={!!editingId} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogHeader>
          <DialogTitle>Editar Conta a Receber</DialogTitle>
          <DialogDescription>Atualize os dados da conta</DialogDescription>
        </DialogHeader>
        <View className="gap-3 mt-3">
          <View className="gap-1">
            <Label>Descrição</Label>
            <Input value={formData.descricao} onChangeText={set("descricao")} />
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1 gap-1">
              <Label>Valor (R$)</Label>
              <Input value={formData.valor} onChangeText={set("valor")} keyboardType="numeric" />
            </View>
            <View className="flex-1 gap-1">
              <Label>Vencimento</Label>
              <Input value={formData.dataVencimento} onChangeText={set("dataVencimento")} />
            </View>
          </View>
          <View className="gap-1">
            <Label>Cliente</Label>
            <Select value={formData.clienteId} onValueChange={set("clienteId")} options={clienteOptions} placeholder="Selecione..." />
          </View>
          <View className="gap-1">
            <Label>Categoria</Label>
            <Select value={formData.categoriaId} onValueChange={set("categoriaId")} options={categoriaOptions} placeholder="Selecione..." />
          </View>
          <View className="gap-1">
            <Label>Nota Fiscal</Label>
            <Input value={formData.notaFiscal} onChangeText={set("notaFiscal")} />
          </View>
          <View className="gap-1">
            <Label>Observações</Label>
            <Input value={formData.observacoes} onChangeText={set("observacoes")} multiline />
          </View>
        </View>
        <DialogFooter>
          <Button variant="outline" onPress={() => setEditingId(null)}>
            <ButtonText variant="outline">Cancelar</ButtonText>
          </Button>
          <Button onPress={handleUpdate}><ButtonText>Salvar</ButtonText></Button>
        </DialogFooter>
      </Dialog>

      {/* Receive Dialog */}
      <Dialog open={!!receivingId} onOpenChange={(open) => !open && setReceivingId(null)}>
        <DialogHeader>
          <DialogTitle>Registrar Recebimento</DialogTitle>
          <DialogDescription>Informe o valor recebido (permite recebimento parcial)</DialogDescription>
        </DialogHeader>
        <View className="gap-3 mt-3">
          <View className="gap-1">
            <Label>Valor Recebido (R$)</Label>
            <Input
              value={receiveForm.valorRecebido}
              onChangeText={(t) => setReceiveForm((f) => ({ ...f, valorRecebido: t }))}
              keyboardType="numeric"
              placeholder="0,00"
            />
          </View>
          <View className="gap-1">
            <Label>Data do Recebimento (AAAA-MM-DD)</Label>
            <Input
              value={receiveForm.dataRecebimento}
              onChangeText={(t) => setReceiveForm((f) => ({ ...f, dataRecebimento: t }))}
              placeholder="2025-01-15"
            />
          </View>
          <View className="gap-1">
            <Label>Forma de Pagamento</Label>
            <Select
              value={receiveForm.formaPagamento}
              onValueChange={(v) => setReceiveForm((f) => ({ ...f, formaPagamento: v }))}
              options={FORMA_PAGAMENTO_OPTIONS}
              placeholder="Selecione..."
            />
          </View>
          <View className="gap-1">
            <Label>Conta Bancária</Label>
            <Select
              value={receiveForm.contaBancariaId}
              onValueChange={(v) => setReceiveForm((f) => ({ ...f, contaBancariaId: v }))}
              options={contaBancariaOptions}
              placeholder="Selecione..."
            />
          </View>
        </View>
        <DialogFooter>
          <Button variant="outline" onPress={() => setReceivingId(null)}>
            <ButtonText variant="outline">Cancelar</ButtonText>
          </Button>
          <Button onPress={handleReceive}><ButtonText>Confirmar</ButtonText></Button>
        </DialogFooter>
      </Dialog>

      {/* List */}
      <Card>
        <CardHeader><CardTitle>Lista de Contas ({filtered.length})</CardTitle></CardHeader>
        <CardContent>
          {!contas ? (
            <ActivityIndicator />
          ) : filtered.length === 0 ? (
            <Text className="text-muted-foreground text-center py-4">Nenhuma conta encontrada</Text>
          ) : (
            <View className="gap-3">
              {filtered.map((conta) => {
                const saldo = conta.valor - conta.valorRecebido;
                return (
                  <View key={conta._id} className="rounded-lg border border-border p-3">
                    <View className="flex-row items-start justify-between">
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2 mb-1">
                          <Badge variant={statusVariant(conta.status)}>{conta.status}</Badge>
                          {conta.valorRecebido > 0 && conta.status !== "Recebido" && (
                            <Text className="text-xs text-emerald-600">
                              Recebido: {formatCurrency(conta.valorRecebido)}
                            </Text>
                          )}
                        </View>
                        <Text className="text-foreground font-medium">{conta.descricao}</Text>
                        <Text className="text-muted-foreground text-xs mt-0.5">
                          {conta.cliente?.nome ?? "Sem cliente"}
                          {conta.notaFiscal ? ` • NF: ${conta.notaFiscal}` : ""}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text className="text-foreground font-bold">{formatCurrency(conta.valor)}</Text>
                        {saldo > 0 && saldo !== conta.valor && (
                          <Text className="text-xs text-amber-600">Saldo: {formatCurrency(saldo)}</Text>
                        )}
                        <Text className="text-muted-foreground text-xs mt-0.5">
                          Venc: {formatDate(conta.dataVencimento)}
                        </Text>
                      </View>
                    </View>
                    <View className="flex-row items-center gap-2 mt-2 pt-2 border-t border-border">
                      {conta.status !== "Recebido" && conta.status !== "Cancelado" && (
                        <Pressable
                          onPress={() => openReceive(conta)}
                          className="flex-row items-center gap-1 px-2 py-1 rounded bg-emerald-50"
                        >
                          <Banknote size={14} color="#10b981" />
                          <Text className="text-xs text-emerald-600">Receber</Text>
                        </Pressable>
                      )}
                      {conta.status !== "Recebido" && conta.status !== "Cancelado" && (
                        <Pressable
                          onPress={() => openEdit(conta)}
                          className="flex-row items-center gap-1 px-2 py-1 rounded bg-gray-50"
                        >
                          <Pencil size={14} color="#666" />
                          <Text className="text-xs text-gray-600">Editar</Text>
                        </Pressable>
                      )}
                      {conta.status !== "Recebido" && conta.status !== "Cancelado" && (
                        <Pressable
                          onPress={() => handleCancelar(conta._id)}
                          className="flex-row items-center gap-1 px-2 py-1 rounded bg-red-50"
                        >
                          <Ban size={14} color="#ef4444" />
                          <Text className="text-xs text-red-600">Cancelar</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </CardContent>
      </Card>
    </View>
  );
}
