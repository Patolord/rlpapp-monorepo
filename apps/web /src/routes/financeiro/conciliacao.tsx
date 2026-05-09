import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated, useQuery, useMutation } from "convex/react";
import {
  Plus,
  Search,
  Filter,
  GitCompareArrows,
  Link2,
  Unlink,
  Eye,
  Upload,
  CheckCircle2,
  XCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Trash2,
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ConvexUnauthRedirect } from "@/components/convex-unauth-redirect";

export const Route = createFileRoute("/financeiro/conciliacao")({
  component: ConciliacaoPage,
});

const statusConfig: Record<string, { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "bg-amber-100 text-amber-800" },
  conciliado: { label: "Conciliado", className: "bg-emerald-100 text-emerald-800" },
  ignorado: { label: "Ignorado", className: "bg-gray-100 text-gray-500" },
};

function ConciliacaoPage() {
  return (
    <>
      <Authenticated>
        <ConciliacaoContent />
      </Authenticated>
      <Unauthenticated>
        <ConvexUnauthRedirect />
      </Unauthenticated>
      <AuthLoading>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </AuthLoading>
    </>
  );
}

type TransacaoForm = {
  contaBancariaId: string;
  data: string;
  descricao: string;
  valor: string;
  tipo: string;
  observacoes: string;
};

const emptyForm: TransacaoForm = {
  contaBancariaId: "",
  data: new Date().toISOString().split("T")[0],
  descricao: "",
  valor: "",
  tipo: "debito",
  observacoes: "",
};

function ConciliacaoContent() {
  const [filterContaBancaria, setFilterContaBancaria] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isConciliarOpen, setIsConciliarOpen] = useState<any>(null);
  const [formData, setFormData] = useState<TransacaoForm>({ ...emptyForm });

  const contasBancarias = useQuery(api.contasBancarias.list, { activeOnly: true });
  const transacoes = useQuery(api.transacoesBancarias.list, {
    contaBancariaId:
      filterContaBancaria !== "all"
        ? (filterContaBancaria as Id<"contasBancarias">)
        : undefined,
    conciliacaoStatus: filterStatus !== "all" ? filterStatus : undefined,
  });
  const dashboardSummary = useQuery(api.conciliacoes.getDashboardSummary, {
    contaBancariaId:
      filterContaBancaria !== "all"
        ? (filterContaBancaria as Id<"contasBancarias">)
        : undefined,
  });

  const createTransacao = useMutation(api.transacoesBancarias.create);
  const removeTransacao = useMutation(api.transacoesBancarias.remove);
  const ignorarTransacao = useMutation(api.transacoesBancarias.ignorar);
  const conciliar = useMutation(api.conciliacoes.conciliar);
  const desconciliar = useMutation(api.conciliacoes.desconciliar);

  const filteredTransacoes = useMemo(() => {
    if (!transacoes) return [];
    if (!searchTerm) return transacoes;
    const term = searchTerm.toLowerCase();
    return transacoes.filter(
      (t) =>
        t.descricao.toLowerCase().includes(term) ||
        t.contaBancaria?.nome?.toLowerCase().includes(term)
    );
  }, [transacoes, searchTerm]);

  const handleCreate = async () => {
    try {
      const valorCents = Math.round(parseFloat(formData.valor.replace(",", ".")) * 100);
      if (isNaN(valorCents) || valorCents <= 0) {
        toast.error("Informe um valor válido");
        return;
      }
      if (!formData.contaBancariaId) {
        toast.error("Selecione uma conta bancária");
        return;
      }
      await createTransacao({
        contaBancariaId: formData.contaBancariaId as Id<"contasBancarias">,
        data: new Date(formData.data).getTime(),
        descricao: formData.descricao,
        valor: valorCents,
        tipo: formData.tipo as "credito" | "debito",
        observacoes: formData.observacoes || undefined,
      });
      toast.success("Transação adicionada com sucesso");
      setIsCreateOpen(false);
      setFormData({ ...emptyForm });
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar transação");
    }
  };

  const handleRemove = async (id: Id<"transacoesBancarias">) => {
    if (!confirm("Deseja excluir esta transação?")) return;
    try {
      await removeTransacao({ id });
      toast.success("Transação excluída");
    } catch (error: any) {
      toast.error(error.message || "Erro ao excluir");
    }
  };

  const handleIgnorar = async (id: Id<"transacoesBancarias">) => {
    try {
      await ignorarTransacao({ id });
      toast.success("Status atualizado");
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar");
    }
  };

  const handleDesconciliar = async (id: Id<"transacoesBancarias">) => {
    try {
      await desconciliar({ transacaoBancariaId: id });
      toast.success("Conciliação desfeita");
    } catch (error: any) {
      toast.error(error.message || "Erro ao desfazer conciliação");
    }
  };

  const summary = dashboardSummary ?? {
    totalTransacoes: 0,
    totalConciliadas: 0,
    totalPendentes: 0,
    totalIgnoradas: 0,
    valorConciliado: 0,
    valorPendente: 0,
    percentualConciliado: 0,
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Conciliação Bancária</h1>
          <p className="text-muted-foreground">
            Concilie transações bancárias com contas a pagar e receber
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setFormData({ ...emptyForm })}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Transação
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Nova Transação Bancária</DialogTitle>
              <DialogDescription>Adicione uma transação do extrato bancário</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Conta Bancária</Label>
                <Select
                  value={formData.contaBancariaId}
                  onValueChange={(v) => setFormData({ ...formData, contaBancariaId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {(contasBancarias ?? []).map((cb) => (
                      <SelectItem key={cb._id} value={cb._id}>
                        {cb.nome} - {cb.banco}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Data</Label>
                  <Input
                    type="date"
                    value={formData.data}
                    onChange={(e) => setFormData({ ...formData, data: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Tipo</Label>
                  <Select
                    value={formData.tipo}
                    onValueChange={(v) => setFormData({ ...formData, tipo: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="credito">Crédito (Entrada)</SelectItem>
                      <SelectItem value="debito">Débito (Saída)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Descrição</Label>
                  <Input
                    placeholder="Descrição da transação"
                    value={formData.descricao}
                    onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Valor (R$)</Label>
                  <Input
                    placeholder="0,00"
                    value={formData.valor}
                    onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Observações</Label>
                <Input
                  placeholder="Observações adicionais..."
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate}>Adicionar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Transações</p>
                <p className="text-2xl font-bold">{summary.totalTransacoes}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
                <GitCompareArrows className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Conciliadas</p>
                <p className="text-2xl font-bold text-emerald-600">{summary.totalConciliadas}</p>
                <p className="text-xs text-emerald-500">{summary.percentualConciliado}% do total</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pendentes</p>
                <p className="text-2xl font-bold text-amber-600">{summary.totalPendentes}</p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(summary.valorPendente)}
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
                <Upload className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Valor Conciliado</p>
                <p className="text-2xl font-bold">{formatCurrency(summary.valorConciliado)}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100">
                <Link2 className="h-5 w-5 text-violet-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por descrição..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={filterContaBancaria} onValueChange={setFilterContaBancaria}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Conta Bancária" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as Contas</SelectItem>
            {(contasBancarias ?? []).map((cb) => (
              <SelectItem key={cb._id} value={cb._id}>
                {cb.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[180px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="conciliado">Conciliado</SelectItem>
            <SelectItem value="ignorado">Ignorado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Transaction table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Extrato Bancário</span>
            <Badge variant="secondary" className="rounded-full">
              {filteredTransacoes.length}{" "}
              {filteredTransacoes.length === 1 ? "transação" : "transações"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!transacoes ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : filteredTransacoes.length === 0 ? (
            <div className="text-center py-8">
              <GitCompareArrows className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-muted-foreground">Nenhuma transação encontrada</p>
              <p className="text-xs text-muted-foreground mt-1">
                Adicione transações do extrato bancário para começar
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransacoes.map((t) => {
                  const cfg = statusConfig[t.conciliacaoStatus] ?? statusConfig.pendente;
                  return (
                    <TableRow key={t._id}>
                      <TableCell>{formatDate(t.data)}</TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {t.descricao}
                      </TableCell>
                      <TableCell>{t.contaBancaria?.nome ?? "-"}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1">
                          {t.tipo === "credito" ? (
                            <ArrowDownToLine className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <ArrowUpFromLine className="h-3.5 w-3.5 text-red-500" />
                          )}
                          {t.tipo === "credito" ? "Crédito" : "Débito"}
                        </span>
                      </TableCell>
                      <TableCell
                        className={`text-right font-semibold ${t.tipo === "credito" ? "text-emerald-600" : "text-red-500"}`}
                      >
                        {t.tipo === "credito" ? "+" : "-"} {formatCurrency(t.valor)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.className}`}
                        >
                          {cfg.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {t.conciliacaoStatus === "pendente" && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                title="Conciliar"
                                onClick={() => setIsConciliarOpen(t)}
                              >
                                <Link2 className="h-4 w-4 text-emerald-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                title="Ignorar"
                                onClick={() => handleIgnorar(t._id)}
                              >
                                <XCircle className="h-4 w-4 text-gray-400" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                title="Excluir"
                                onClick={() => handleRemove(t._id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          )}
                          {t.conciliacaoStatus === "conciliado" && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Desfazer conciliação"
                              onClick={() => handleDesconciliar(t._id)}
                            >
                              <Unlink className="h-4 w-4 text-amber-600" />
                            </Button>
                          )}
                          {t.conciliacaoStatus === "ignorado" && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Restaurar"
                              onClick={() => handleIgnorar(t._id)}
                            >
                              <Eye className="h-4 w-4 text-blue-600" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Conciliar dialog */}
      {isConciliarOpen && (
        <ConciliarDialog
          transacao={isConciliarOpen}
          onClose={() => setIsConciliarOpen(null)}
          conciliar={conciliar}
        />
      )}
    </div>
  );
}

function ConciliarDialog({
  transacao,
  onClose,
  conciliar,
}: {
  transacao: any;
  onClose: () => void;
  conciliar: any;
}) {
  const sugestoes = useQuery(api.conciliacoes.getSugestoes, {
    transacaoBancariaId: transacao._id,
  });
  const [selectedId, setSelectedId] = useState<string>("");
  const [manualSearch, setManualSearch] = useState("");

  const contasPagar = useQuery(api.contasPagar.list, {});
  const contasReceber = useQuery(api.contasReceber.list, {});

  const isDebito = transacao.tipo === "debito";
  const manualList = isDebito ? contasPagar : contasReceber;

  const filteredManual = useMemo(() => {
    if (!manualList || !manualSearch) return [];
    const term = manualSearch.toLowerCase();
    return manualList
      .filter((c: any) => {
        if (isDebito) {
          return (
            c.status !== "Pago" &&
            c.status !== "Cancelado" &&
            c.descricao.toLowerCase().includes(term)
          );
        }
        return (
          c.status !== "Recebido" &&
          c.status !== "Cancelado" &&
          c.descricao.toLowerCase().includes(term)
        );
      })
      .slice(0, 10);
  }, [manualList, manualSearch, isDebito]);

  const handleConciliar = async () => {
    if (!selectedId) {
      toast.error("Selecione uma conta para conciliar");
      return;
    }
    try {
      await conciliar({
        transacaoBancariaId: transacao._id,
        contaPagarId: isDebito ? (selectedId as Id<"contasPagar">) : undefined,
        contaReceberId: !isDebito ? (selectedId as Id<"contasReceber">) : undefined,
      });
      toast.success("Transação conciliada com sucesso");
      onClose();
    } catch (error: any) {
      toast.error(error.message || "Erro ao conciliar");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Conciliar Transação</DialogTitle>
          <DialogDescription>
            <span className="font-medium">{transacao.descricao}</span> —{" "}
            <span className={transacao.tipo === "credito" ? "text-emerald-600" : "text-red-500"}>
              {formatCurrency(transacao.valor)}
            </span>{" "}
            ({transacao.tipo === "credito" ? "Crédito" : "Débito"})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Sugestões automáticas */}
          {sugestoes && sugestoes.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Sugestões automáticas</Label>
              <div className="space-y-2">
                {sugestoes.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      selectedId === s.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-border hover:bg-muted/50"
                    }`}
                    onClick={() => setSelectedId(s.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{s.descricao}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.tipo === "contaPagar" ? "Conta a Pagar" : "Conta a Receber"} •{" "}
                          {formatDate(s.data)} • {s.status}
                        </p>
                      </div>
                      <span className="font-semibold text-sm">{formatCurrency(s.valor)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Busca manual */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Busca manual ({isDebito ? "Contas a Pagar" : "Contas a Receber"})
            </Label>
            <Input
              placeholder="Buscar por descrição..."
              value={manualSearch}
              onChange={(e) => setManualSearch(e.target.value)}
            />
            {filteredManual.length > 0 && (
              <div className="max-h-48 overflow-y-auto space-y-1">
                {filteredManual.map((c: any) => (
                  <button
                    type="button"
                    key={c._id}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      selectedId === c._id
                        ? "border-blue-500 bg-blue-50"
                        : "border-border hover:bg-muted/50"
                    }`}
                    onClick={() => setSelectedId(c._id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{c.descricao}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(c.dataVencimento)} • {c.status}
                        </p>
                      </div>
                      <span className="font-semibold text-sm">
                        {formatCurrency(isDebito ? c.valor : c.valor - (c.valorRecebido ?? 0))}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleConciliar} disabled={!selectedId}>
            <Link2 className="h-4 w-4 mr-2" />
            Conciliar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatCurrency(valueInCents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valueInCents / 100);
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(timestamp);
}
