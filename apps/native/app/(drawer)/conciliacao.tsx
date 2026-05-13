import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { Authenticated, AuthLoading, Unauthenticated, useMutation, useQuery } from "convex/react";
import {
  Plus,
  Lock,
  Search,
  ArrowDownToLine,
  ArrowUpFromLine,
  Link2,
  Undo2,
  EyeOff,
  Trash2,
  CheckCircle2,
  Clock,
  GitCompareArrows,
} from "lucide-react-native";
import { useState, useMemo } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { Link } from "expo-router";

import { Container } from "@/components/container";
import { Button, ButtonText } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
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
  { label: "Pendente", value: "pendente" },
  { label: "Conciliado", value: "conciliado" },
  { label: "Ignorado", value: "ignorado" },
];

const TIPO_OPTIONS = [
  { label: "Crédito", value: "credito" },
  { label: "Débito", value: "debito" },
];

const statusVariant = (status: string) => {
  switch (status) {
    case "pendente": return "warning" as const;
    case "conciliado": return "success" as const;
    case "ignorado": return "secondary" as const;
    default: return "outline" as const;
  }
};

export default function ConciliacaoScreen() {
  return (
    <Container className="px-5 pt-4 pb-4">
      <Authenticated>
        <ConciliacaoContent />
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

function ConciliacaoContent() {
  const contasBancarias = useQuery(api.contasBancarias.list, {});
  const [contaBancariaFilter, setContaBancariaFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const transacoes = useQuery(api.transacoesBancarias.list, {
    contaBancariaId: contaBancariaFilter ? (contaBancariaFilter as Id<"contasBancarias">) : undefined,
    conciliacaoStatus: statusFilter || undefined,
  });
  const summary = useQuery(api.conciliacoes.getDashboardSummary, {
    contaBancariaId: contaBancariaFilter ? (contaBancariaFilter as Id<"contasBancarias">) : undefined,
  });

  const createTransacao = useMutation(api.transacoesBancarias.create);
  const removeTransacao = useMutation(api.transacoesBancarias.remove);
  const ignorarTransacao = useMutation(api.transacoesBancarias.ignorar);
  const conciliar = useMutation(api.conciliacoes.conciliar);
  const desconciliar = useMutation(api.conciliacoes.desconciliar);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [conciliandoId, setConciliandoId] = useState<Id<"transacoesBancarias"> | null>(null);
  const [createForm, setCreateForm] = useState({
    contaBancariaId: "",
    data: "",
    tipo: "",
    descricao: "",
    valor: "",
    observacoes: "",
  });

  const contaBancariaOptions = useMemo(
    () => [
      { label: "Todas", value: "" },
      ...(contasBancarias ?? []).filter((c) => c.isActive).map((c) => ({ label: `${c.nome} - ${c.banco}`, value: c._id })),
    ],
    [contasBancarias],
  );

  const contaBancariaCreateOptions = useMemo(
    () => (contasBancarias ?? []).filter((c) => c.isActive).map((c) => ({ label: `${c.nome} - ${c.banco}`, value: c._id })),
    [contasBancarias],
  );

  const filtered = useMemo(() => {
    if (!transacoes) return [];
    if (!search) return transacoes;
    const term = search.toLowerCase();
    return transacoes.filter((t) => t.descricao.toLowerCase().includes(term));
  }, [transacoes, search]);

  const handleCreate = async () => {
    try {
      await createTransacao({
        contaBancariaId: createForm.contaBancariaId as Id<"contasBancarias">,
        data: createForm.data ? new Date(createForm.data).getTime() : Date.now(),
        tipo: createForm.tipo as any,
        descricao: createForm.descricao,
        valor: parseCurrency(createForm.valor),
        observacoes: createForm.observacoes || undefined,
      });
      setIsCreateOpen(false);
      setCreateForm({ contaBancariaId: "", data: "", tipo: "", descricao: "", valor: "", observacoes: "" });
    } catch (e: any) {
      Alert.alert("Erro", e.message ?? "Erro ao criar transação");
    }
  };

  const handleRemove = (id: Id<"transacoesBancarias">) => {
    Alert.alert("Excluir", "Deseja excluir esta transação?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          try {
            await removeTransacao({ id });
          } catch (e: any) {
            Alert.alert("Erro", e.message);
          }
        },
      },
    ]);
  };

  const handleIgnorar = async (id: Id<"transacoesBancarias">) => {
    try {
      await ignorarTransacao({ id });
    } catch (e: any) {
      Alert.alert("Erro", e.message);
    }
  };

  const handleDesconciliar = async (id: Id<"transacoesBancarias">) => {
    Alert.alert("Desfazer", "Deseja desfazer a conciliação?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Desfazer",
        onPress: async () => {
          try {
            await desconciliar({ transacaoBancariaId: id });
          } catch (e: any) {
            Alert.alert("Erro", e.message);
          }
        },
      },
    ]);
  };

  const summaryData = summary ?? {
    totalTransacoes: 0,
    totalConciliadas: 0,
    totalPendentes: 0,
    valorConciliado: 0,
  };

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-2xl font-bold text-foreground">Conciliação Bancária</Text>
          <Text className="text-muted-foreground text-sm">Vincule transações a contas</Text>
        </View>
        <Button onPress={() => setIsCreateOpen(true)}>
          <View className="flex-row items-center gap-1">
            <Plus size={16} color="#fff" />
            <ButtonText>Nova Transação</ButtonText>
          </View>
        </Button>
      </View>

      {/* Summary Cards */}
      <View className="flex-row flex-wrap gap-3">
        <SummaryCard title="Total" value={String(summaryData.totalTransacoes)} icon={<GitCompareArrows size={16} color="#8b5cf6" />} color="#8b5cf6" />
        <SummaryCard title="Conciliadas" value={String(summaryData.totalConciliadas)} icon={<CheckCircle2 size={16} color="#10b981" />} color="#10b981" />
        <SummaryCard title="Pendentes" value={String(summaryData.totalPendentes)} icon={<Clock size={16} color="#f59e0b" />} color="#f59e0b" />
        <SummaryCard title="Valor Conciliado" value={formatCurrency(summaryData.valorConciliado)} icon={<CheckCircle2 size={16} color="#3b82f6" />} color="#3b82f6" />
      </View>

      {/* Filters */}
      <View className="gap-3">
        <Select
          value={contaBancariaFilter}
          onValueChange={setContaBancariaFilter}
          options={contaBancariaOptions}
          placeholder="Conta bancária"
        />
        <View className="flex-row gap-3">
          <View style={{ width: 140 }}>
            <Select value={statusFilter} onValueChange={setStatusFilter} options={STATUS_OPTIONS} placeholder="Status" />
          </View>
          <View className="flex-1">
            <View className="flex-row items-center border border-input rounded-md bg-card px-3 h-10">
              <Search size={16} color="#9ca3af" />
              <Input className="flex-1 border-0 h-10" placeholder="Buscar..." value={search} onChangeText={setSearch} />
            </View>
          </View>
        </View>
      </View>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogHeader>
          <DialogTitle>Nova Transação Bancária</DialogTitle>
          <DialogDescription>Registre uma transação manualmente</DialogDescription>
        </DialogHeader>
        <View className="gap-3 mt-3">
          <View className="gap-1">
            <Label>Conta Bancária</Label>
            <Select
              value={createForm.contaBancariaId}
              onValueChange={(v) => setCreateForm((f) => ({ ...f, contaBancariaId: v }))}
              options={contaBancariaCreateOptions}
              placeholder="Selecione..."
            />
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1 gap-1">
              <Label>Data (AAAA-MM-DD)</Label>
              <Input
                value={createForm.data}
                onChangeText={(t) => setCreateForm((f) => ({ ...f, data: t }))}
                placeholder="2025-01-15"
              />
            </View>
            <View className="flex-1 gap-1">
              <Label>Tipo</Label>
              <Select
                value={createForm.tipo}
                onValueChange={(v) => setCreateForm((f) => ({ ...f, tipo: v }))}
                options={TIPO_OPTIONS}
                placeholder="Selecione..."
              />
            </View>
          </View>
          <View className="gap-1">
            <Label>Descrição</Label>
            <Input
              value={createForm.descricao}
              onChangeText={(t) => setCreateForm((f) => ({ ...f, descricao: t }))}
              placeholder="Descrição da transação"
            />
          </View>
          <View className="gap-1">
            <Label>Valor (R$)</Label>
            <Input
              value={createForm.valor}
              onChangeText={(t) => setCreateForm((f) => ({ ...f, valor: t }))}
              keyboardType="numeric"
              placeholder="0,00"
            />
          </View>
          <View className="gap-1">
            <Label>Observações</Label>
            <Input
              value={createForm.observacoes}
              onChangeText={(t) => setCreateForm((f) => ({ ...f, observacoes: t }))}
              placeholder="Observações..."
              multiline
            />
          </View>
        </View>
        <DialogFooter>
          <Button variant="outline" onPress={() => setIsCreateOpen(false)}>
            <ButtonText variant="outline">Cancelar</ButtonText>
          </Button>
          <Button onPress={handleCreate}><ButtonText>Criar</ButtonText></Button>
        </DialogFooter>
      </Dialog>

      {/* Conciliar Dialog */}
      {conciliandoId && (
        <ConciliarDialog
          transacaoId={conciliandoId}
          onClose={() => setConciliandoId(null)}
          conciliar={conciliar}
        />
      )}

      {/* List */}
      <Card>
        <CardHeader><CardTitle>Transações ({filtered.length})</CardTitle></CardHeader>
        <CardContent>
          {!transacoes ? (
            <ActivityIndicator />
          ) : filtered.length === 0 ? (
            <Text className="text-muted-foreground text-center py-4">Nenhuma transação encontrada</Text>
          ) : (
            <View className="gap-3">
              {filtered.map((t) => (
                <View key={t._id} className="rounded-lg border border-border p-3">
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2 mb-1">
                        <Badge variant={statusVariant(t.conciliacaoStatus)}>
                          {t.conciliacaoStatus === "pendente" ? "Pendente" : t.conciliacaoStatus === "conciliado" ? "Conciliado" : "Ignorado"}
                        </Badge>
                        {t.tipo === "credito" ? (
                          <View className="flex-row items-center gap-1">
                            <ArrowDownToLine size={12} color="#10b981" />
                            <Text className="text-xs text-emerald-600">Crédito</Text>
                          </View>
                        ) : (
                          <View className="flex-row items-center gap-1">
                            <ArrowUpFromLine size={12} color="#ef4444" />
                            <Text className="text-xs text-red-600">Débito</Text>
                          </View>
                        )}
                      </View>
                      <Text className="text-foreground font-medium">{t.descricao}</Text>
                      <Text className="text-muted-foreground text-xs mt-0.5">
                        {t.contaBancaria?.nome ?? "—"} • {formatDate(t.data)}
                      </Text>
                    </View>
                    <Text className={`font-bold ${t.tipo === "credito" ? "text-emerald-600" : "text-red-600"}`}>
                      {t.tipo === "credito" ? "+" : "-"}{formatCurrency(t.valor)}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2 mt-2 pt-2 border-t border-border">
                    {t.conciliacaoStatus === "pendente" && (
                      <>
                        <Pressable
                          onPress={() => setConciliandoId(t._id)}
                          className="flex-row items-center gap-1 px-2 py-1 rounded bg-blue-50"
                        >
                          <Link2 size={14} color="#3b82f6" />
                          <Text className="text-xs text-blue-600">Conciliar</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleIgnorar(t._id)}
                          className="flex-row items-center gap-1 px-2 py-1 rounded bg-gray-50"
                        >
                          <EyeOff size={14} color="#666" />
                          <Text className="text-xs text-gray-600">Ignorar</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleRemove(t._id)}
                          className="flex-row items-center gap-1 px-2 py-1 rounded bg-red-50"
                        >
                          <Trash2 size={14} color="#ef4444" />
                          <Text className="text-xs text-red-600">Excluir</Text>
                        </Pressable>
                      </>
                    )}
                    {t.conciliacaoStatus === "conciliado" && (
                      <Pressable
                        onPress={() => handleDesconciliar(t._id)}
                        className="flex-row items-center gap-1 px-2 py-1 rounded bg-amber-50"
                      >
                        <Undo2 size={14} color="#d97706" />
                        <Text className="text-xs text-amber-600">Desfazer</Text>
                      </Pressable>
                    )}
                    {t.conciliacaoStatus === "ignorado" && (
                      <Pressable
                        onPress={() => handleIgnorar(t._id)}
                        className="flex-row items-center gap-1 px-2 py-1 rounded bg-gray-50"
                      >
                        <Undo2 size={14} color="#666" />
                        <Text className="text-xs text-gray-600">Restaurar</Text>
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

function SummaryCard({ title, value, icon, color }: { title: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <Card className="rounded-xl" style={{ width: "48%" }}>
      <CardContent className="p-3">
        <View className="flex-row items-center gap-2">
          <View className="w-8 h-8 rounded-lg items-center justify-center" style={{ backgroundColor: color + "15" }}>
            {icon}
          </View>
          <View className="flex-1">
            <Text className="text-xs text-muted-foreground">{title}</Text>
            <Text className="text-base font-bold text-foreground" numberOfLines={1}>{value}</Text>
          </View>
        </View>
      </CardContent>
    </Card>
  );
}

function ConciliarDialog({
  transacaoId,
  onClose,
  conciliar,
}: {
  transacaoId: Id<"transacoesBancarias">;
  onClose: () => void;
  conciliar: any;
}) {
  const sugestoes = useQuery(api.conciliacoes.getSugestoes, { transacaoBancariaId: transacaoId });

  const handleConciliar = async (tipo: string, id: string) => {
    try {
      await conciliar({
        transacaoBancariaId: transacaoId,
        contaPagarId: tipo === "contaPagar" ? (id as Id<"contasPagar">) : undefined,
        contaReceberId: tipo === "contaReceber" ? (id as Id<"contasReceber">) : undefined,
      });
      onClose();
    } catch (e: any) {
      Alert.alert("Erro", e.message ?? "Erro ao conciliar");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogHeader>
        <DialogTitle>Conciliar Transação</DialogTitle>
        <DialogDescription>Selecione a conta correspondente</DialogDescription>
      </DialogHeader>
      <View className="gap-3 mt-3">
        {!sugestoes ? (
          <ActivityIndicator />
        ) : sugestoes.length === 0 ? (
          <Text className="text-muted-foreground text-center py-4">Nenhuma sugestão encontrada</Text>
        ) : (
          sugestoes.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => handleConciliar(s.tipo, s.id)}
              className="rounded-lg border border-border p-3"
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <View className="flex-row items-center gap-2 mb-1">
                    <Badge variant={s.tipo === "contaPagar" ? "destructive" : "success"}>
                      {s.tipo === "contaPagar" ? "Conta a Pagar" : "Conta a Receber"}
                    </Badge>
                    <Badge variant="outline">{s.status}</Badge>
                  </View>
                  <Text className="text-foreground font-medium">{s.descricao}</Text>
                  <Text className="text-muted-foreground text-xs mt-0.5">
                    Venc: {formatDate(s.data)}
                  </Text>
                </View>
                <Text className="text-foreground font-bold">{formatCurrency(s.valor)}</Text>
              </View>
            </Pressable>
          ))
        )}
      </View>
      <DialogFooter>
        <Button variant="outline" onPress={onClose}>
          <ButtonText variant="outline">Fechar</ButtonText>
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
