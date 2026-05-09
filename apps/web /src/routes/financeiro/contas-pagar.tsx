import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated, useQuery, useMutation } from "convex/react";
import {
  Plus,
  Pencil,
  CheckCircle2,
  XCircle,
  Ban,
  DollarSign,
  Search,
  Filter,
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export const Route = createFileRoute("/financeiro/contas-pagar")({
  component: ContasPagarPage,
});

type FormData = {
  descricao: string;
  valor: string;
  dataVencimento: string;
  dataCompetencia: string;
  categoriaId: string;
  fornecedorId: string;
  contaBancariaId: string;
  formaPagamento: string;
  recorrente: boolean;
  observacoes: string;
};

const emptyForm: FormData = {
  descricao: "",
  valor: "",
  dataVencimento: "",
  dataCompetencia: "",
  categoriaId: "",
  fornecedorId: "",
  contaBancariaId: "",
  formaPagamento: "",
  recorrente: false,
  observacoes: "",
};

const statusConfig: Record<string, { label: string; variant: string; className: string }> = {
  Pendente: { label: "Pendente", variant: "warning", className: "bg-amber-100 text-amber-800" },
  Aprovado: { label: "Aprovado", variant: "info", className: "bg-blue-100 text-blue-800" },
  Pago: { label: "Pago", variant: "success", className: "bg-emerald-100 text-emerald-800" },
  Vencido: { label: "Vencido", variant: "destructive", className: "bg-red-100 text-red-800" },
  Cancelado: { label: "Cancelado", variant: "secondary", className: "bg-gray-100 text-gray-500" },
};

function ContasPagarPage() {
  return (
    <>
      <Authenticated>
        <ContasPagarContent />
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

function ContasPagarContent() {
  const contas = useQuery(api.contasPagar.list, {});
  const categorias = useQuery(api.categoriasFinanceiras.list, { activeOnly: true });
  const fornecedores = useQuery(api.suppliers.list, {});
  const contasBancarias = useQuery(api.contasBancarias.list, { activeOnly: true });

  const createConta = useMutation(api.contasPagar.create);
  const updateConta = useMutation(api.contasPagar.update);
  const aprovarConta = useMutation(api.contasPagar.aprovar);
  const pagarConta = useMutation(api.contasPagar.registrarPagamento);
  const cancelarConta = useMutation(api.contasPagar.cancelar);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingConta, setEditingConta] = useState<any>(null);
  const [isPagamentoOpen, setIsPagamentoOpen] = useState<any>(null);
  const [formData, setFormData] = useState<FormData>({ ...emptyForm });
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const [pagamentoData, setPagamentoData] = useState({
    dataPagamento: new Date().toISOString().split("T")[0],
    formaPagamento: "",
    contaBancariaId: "",
  });

  const filteredContas = useMemo(() => {
    if (!contas) return [];
    let result = contas;
    if (filterStatus !== "all") {
      result = result.filter((c) => c.status === filterStatus);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (c) =>
          c.descricao.toLowerCase().includes(term) ||
          c.fornecedor?.name?.toLowerCase().includes(term)
      );
    }
    return result;
  }, [contas, filterStatus, searchTerm]);

  const resetForm = () => setFormData({ ...emptyForm });

  const handleCreate = async () => {
    try {
      const valorCents = Math.round(parseFloat(formData.valor.replace(",", ".")) * 100);
      if (isNaN(valorCents) || valorCents <= 0) {
        toast.error("Informe um valor válido");
        return;
      }
      await createConta({
        descricao: formData.descricao,
        valor: valorCents,
        dataVencimento: new Date(formData.dataVencimento).getTime(),
        dataCompetencia: formData.dataCompetencia
          ? new Date(formData.dataCompetencia).getTime()
          : new Date(formData.dataVencimento).getTime(),
        categoriaId: formData.categoriaId ? (formData.categoriaId as any) : undefined,
        fornecedorId: formData.fornecedorId ? (formData.fornecedorId as any) : undefined,
        contaBancariaId: formData.contaBancariaId ? (formData.contaBancariaId as any) : undefined,
        formaPagamento: formData.formaPagamento ? (formData.formaPagamento as any) : undefined,
        recorrente: formData.recorrente || undefined,
        observacoes: formData.observacoes || undefined,
      });
      toast.success("Conta a pagar criada com sucesso");
      setIsCreateOpen(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar conta");
    }
  };

  const handleUpdate = async () => {
    if (!editingConta) return;
    try {
      const valorCents = Math.round(parseFloat(formData.valor.replace(",", ".")) * 100);
      if (isNaN(valorCents) || valorCents <= 0) {
        toast.error("Informe um valor válido");
        return;
      }
      await updateConta({
        id: editingConta._id,
        descricao: formData.descricao,
        valor: valorCents,
        dataVencimento: new Date(formData.dataVencimento).getTime(),
        dataCompetencia: formData.dataCompetencia
          ? new Date(formData.dataCompetencia).getTime()
          : undefined,
        categoriaId: formData.categoriaId ? (formData.categoriaId as any) : undefined,
        fornecedorId: formData.fornecedorId ? (formData.fornecedorId as any) : undefined,
        contaBancariaId: formData.contaBancariaId ? (formData.contaBancariaId as any) : undefined,
        formaPagamento: formData.formaPagamento ? (formData.formaPagamento as any) : undefined,
        recorrente: formData.recorrente || undefined,
        observacoes: formData.observacoes || undefined,
      });
      toast.success("Conta atualizada com sucesso");
      setEditingConta(null);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar conta");
    }
  };

  const handleAprovar = async (id: any) => {
    try {
      await aprovarConta({ id });
      toast.success("Conta aprovada");
    } catch (error: any) {
      toast.error(error.message || "Erro ao aprovar");
    }
  };

  const handlePagar = async () => {
    if (!isPagamentoOpen) return;
    try {
      await pagarConta({
        id: isPagamentoOpen._id,
        dataPagamento: new Date(pagamentoData.dataPagamento).getTime(),
        formaPagamento: pagamentoData.formaPagamento
          ? (pagamentoData.formaPagamento as any)
          : undefined,
        contaBancariaId: pagamentoData.contaBancariaId
          ? (pagamentoData.contaBancariaId as any)
          : undefined,
      });
      toast.success("Pagamento registrado");
      setIsPagamentoOpen(null);
    } catch (error: any) {
      toast.error(error.message || "Erro ao registrar pagamento");
    }
  };

  const handleCancelar = async (id: any) => {
    if (!confirm("Deseja realmente cancelar esta conta?")) return;
    try {
      await cancelarConta({ id });
      toast.success("Conta cancelada");
    } catch (error: any) {
      toast.error(error.message || "Erro ao cancelar");
    }
  };

  const openEdit = (conta: any) => {
    setEditingConta(conta);
    setFormData({
      descricao: conta.descricao,
      valor: (conta.valor / 100).toFixed(2).replace(".", ","),
      dataVencimento: new Date(conta.dataVencimento).toISOString().split("T")[0],
      dataCompetencia: new Date(conta.dataCompetencia).toISOString().split("T")[0],
      categoriaId: conta.categoriaId ?? "",
      fornecedorId: conta.fornecedorId ?? "",
      contaBancariaId: conta.contaBancariaId ?? "",
      formaPagamento: conta.formaPagamento ?? "",
      recorrente: conta.recorrente ?? false,
      observacoes: conta.observacoes ?? "",
    });
  };

  const FormFields = ({ prefix }: { prefix: string }) => (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor={`${prefix}-descricao`}>Descrição</Label>
        <Input
          id={`${prefix}-descricao`}
          placeholder="Ex: Aluguel escritório, Conta de luz..."
          value={formData.descricao}
          onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-valor`}>Valor (R$)</Label>
          <Input
            id={`${prefix}-valor`}
            placeholder="0,00"
            value={formData.valor}
            onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-formaPagamento`}>Forma de Pagamento</Label>
          <Select
            value={formData.formaPagamento}
            onValueChange={(v) => setFormData({ ...formData, formaPagamento: v })}
          >
            <SelectTrigger id={`${prefix}-formaPagamento`}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pix">PIX</SelectItem>
              <SelectItem value="ted">TED</SelectItem>
              <SelectItem value="boleto">Boleto</SelectItem>
              <SelectItem value="dinheiro">Dinheiro</SelectItem>
              <SelectItem value="cartao">Cartão</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-dataVencimento`}>Data de Vencimento</Label>
          <Input
            id={`${prefix}-dataVencimento`}
            type="date"
            value={formData.dataVencimento}
            onChange={(e) => setFormData({ ...formData, dataVencimento: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-dataCompetencia`}>Data de Competência</Label>
          <Input
            id={`${prefix}-dataCompetencia`}
            type="date"
            value={formData.dataCompetencia}
            onChange={(e) => setFormData({ ...formData, dataCompetencia: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-categoriaId`}>Categoria</Label>
          <Select
            value={formData.categoriaId}
            onValueChange={(v) => setFormData({ ...formData, categoriaId: v })}
          >
            <SelectTrigger id={`${prefix}-categoriaId`}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {(categorias ?? []).map((cat) => (
                <SelectItem key={cat._id} value={cat._id}>
                  {cat.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-fornecedorId`}>Fornecedor</Label>
          <Select
            value={formData.fornecedorId}
            onValueChange={(v) => setFormData({ ...formData, fornecedorId: v })}
          >
            <SelectTrigger id={`${prefix}-fornecedorId`}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {(fornecedores ?? [])
                .filter((f) => f.isActive)
                .map((f) => (
                  <SelectItem key={f._id} value={f._id}>
                    {f.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${prefix}-contaBancariaId`}>Conta Bancária</Label>
        <Select
          value={formData.contaBancariaId}
          onValueChange={(v) => setFormData({ ...formData, contaBancariaId: v })}
        >
          <SelectTrigger id={`${prefix}-contaBancariaId`}>
            <SelectValue placeholder="Selecione (opcional)" />
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
      <div className="grid gap-2">
        <Label htmlFor={`${prefix}-observacoes`}>Observações</Label>
        <Input
          id={`${prefix}-observacoes`}
          placeholder="Observações adicionais..."
          value={formData.observacoes}
          onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
        />
      </div>
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contas a Pagar</h1>
          <p className="text-muted-foreground">Gerencie suas obrigações financeiras</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Conta
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Nova Conta a Pagar</DialogTitle>
              <DialogDescription>Preencha os dados da conta</DialogDescription>
            </DialogHeader>
            <FormFields prefix="create" />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate}>Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!editingConta} onOpenChange={(open) => !open && setEditingConta(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Conta a Pagar</DialogTitle>
            <DialogDescription>Atualize os dados da conta</DialogDescription>
          </DialogHeader>
          <FormFields prefix="edit" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingConta(null)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdate}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!isPagamentoOpen} onOpenChange={(open) => !open && setIsPagamentoOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Pagamento</DialogTitle>
            <DialogDescription>
              {isPagamentoOpen?.descricao} — {formatCurrency(isPagamentoOpen?.valor ?? 0)}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="pag-data">Data do Pagamento</Label>
              <Input
                id="pag-data"
                type="date"
                value={pagamentoData.dataPagamento}
                onChange={(e) =>
                  setPagamentoData({ ...pagamentoData, dataPagamento: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pag-forma">Forma de Pagamento</Label>
              <Select
                value={pagamentoData.formaPagamento}
                onValueChange={(v) =>
                  setPagamentoData({ ...pagamentoData, formaPagamento: v })
                }
              >
                <SelectTrigger id="pag-forma">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="ted">TED</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="cartao">Cartão</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pag-conta">Conta Bancária</Label>
              <Select
                value={pagamentoData.contaBancariaId}
                onValueChange={(v) =>
                  setPagamentoData({ ...pagamentoData, contaBancariaId: v })
                }
              >
                <SelectTrigger id="pag-conta">
                  <SelectValue placeholder="Selecione (opcional)" />
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPagamentoOpen(null)}>
              Cancelar
            </Button>
            <Button onClick={handlePagar} className="bg-emerald-600 hover:bg-emerald-700">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Confirmar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por descrição ou fornecedor..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[180px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="Pendente">Pendente</SelectItem>
            <SelectItem value="Aprovado">Aprovado</SelectItem>
            <SelectItem value="Pago">Pago</SelectItem>
            <SelectItem value="Vencido">Vencido</SelectItem>
            <SelectItem value="Cancelado">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Lista de Contas a Pagar</span>
            <Badge variant="secondary" className="rounded-full">
              {filteredContas.length} {filteredContas.length === 1 ? "conta" : "contas"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!contas ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : filteredContas.length === 0 ? (
            <div className="text-center py-8">
              <DollarSign className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-muted-foreground">Nenhuma conta encontrada</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContas.map((conta) => {
                  const cfg = statusConfig[conta.status] ?? statusConfig.Pendente;
                  const isOverdue =
                    (conta.status === "Pendente" || conta.status === "Aprovado") &&
                    conta.dataVencimento < Date.now();
                  return (
                    <TableRow key={conta._id}>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {conta.descricao}
                      </TableCell>
                      <TableCell>{conta.fornecedor?.name ?? "-"}</TableCell>
                      <TableCell>{conta.categoria?.nome ?? "-"}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(conta.valor)}
                      </TableCell>
                      <TableCell>
                        <span className={isOverdue ? "text-red-600 font-medium" : ""}>
                          {formatDate(conta.dataVencimento)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.className}`}>
                          {isOverdue && conta.status !== "Vencido" ? "Vencido" : cfg.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {(conta.status === "Pendente" || conta.status === "Vencido") && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Aprovar"
                              onClick={() => handleAprovar(conta._id)}
                            >
                              <CheckCircle2 className="h-4 w-4 text-blue-600" />
                            </Button>
                          )}
                          {(conta.status === "Aprovado" || conta.status === "Pendente" || conta.status === "Vencido") && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Registrar Pagamento"
                              onClick={() => {
                                setIsPagamentoOpen(conta);
                                setPagamentoData({
                                  dataPagamento: new Date().toISOString().split("T")[0],
                                  formaPagamento: conta.formaPagamento ?? "",
                                  contaBancariaId: conta.contaBancariaId ?? "",
                                });
                              }}
                            >
                              <DollarSign className="h-4 w-4 text-emerald-600" />
                            </Button>
                          )}
                          {conta.status !== "Pago" && conta.status !== "Cancelado" && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                title="Editar"
                                onClick={() => openEdit(conta)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                title="Cancelar"
                                onClick={() => handleCancelar(conta._id)}
                              >
                                <Ban className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
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
    </div>
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
