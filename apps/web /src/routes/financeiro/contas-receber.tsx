import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated, useQuery, useMutation } from "convex/react";
import {
  Plus,
  Pencil,
  Ban,
  DollarSign,
  Search,
  Filter,
  ArrowDownToLine,
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

export const Route = createFileRoute("/financeiro/contas-receber")({
  component: ContasReceberPage,
});

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
  dataEmissao: new Date().toISOString().split("T")[0],
  categoriaId: "",
  clienteId: "",
  contaBancariaId: "",
  formaPagamento: "",
  notaFiscal: "",
  observacoes: "",
};

const statusConfig: Record<string, { label: string; className: string }> = {
  Emitido: { label: "Emitido", className: "bg-blue-100 text-blue-800" },
  Parcial: { label: "Parcial", className: "bg-amber-100 text-amber-800" },
  Recebido: { label: "Recebido", className: "bg-emerald-100 text-emerald-800" },
  Vencido: { label: "Vencido", className: "bg-red-100 text-red-800" },
  Cancelado: { label: "Cancelado", className: "bg-gray-100 text-gray-500" },
};

function ContasReceberPage() {
  return (
    <>
      <Authenticated>
        <ContasReceberContent />
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

function ContasReceberContent() {
  const contas = useQuery(api.contasReceber.list, {});
  const categorias = useQuery(api.categoriasFinanceiras.list, { activeOnly: true });
  const clientes = useQuery(api.clientes.list, { activeOnly: true });
  const contasBancarias = useQuery(api.contasBancarias.list, { activeOnly: true });

  const createConta = useMutation(api.contasReceber.create);
  const updateConta = useMutation(api.contasReceber.update);
  const receberConta = useMutation(api.contasReceber.registrarRecebimento);
  const cancelarConta = useMutation(api.contasReceber.cancelar);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingConta, setEditingConta] = useState<any>(null);
  const [isRecebimentoOpen, setIsRecebimentoOpen] = useState<any>(null);
  const [formData, setFormData] = useState<FormData>({ ...emptyForm });
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const [recebimentoData, setRecebimentoData] = useState({
    valorRecebido: "",
    dataRecebimento: new Date().toISOString().split("T")[0],
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
          c.cliente?.nome?.toLowerCase().includes(term) ||
          c.notaFiscal?.toLowerCase().includes(term)
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
        dataEmissao: formData.dataEmissao
          ? new Date(formData.dataEmissao).getTime()
          : Date.now(),
        categoriaId: formData.categoriaId ? (formData.categoriaId as any) : undefined,
        clienteId: formData.clienteId ? (formData.clienteId as any) : undefined,
        contaBancariaId: formData.contaBancariaId ? (formData.contaBancariaId as any) : undefined,
        formaPagamento: formData.formaPagamento ? (formData.formaPagamento as any) : undefined,
        notaFiscal: formData.notaFiscal || undefined,
        observacoes: formData.observacoes || undefined,
      });
      toast.success("Conta a receber criada com sucesso");
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
        dataEmissao: formData.dataEmissao
          ? new Date(formData.dataEmissao).getTime()
          : undefined,
        categoriaId: formData.categoriaId ? (formData.categoriaId as any) : undefined,
        clienteId: formData.clienteId ? (formData.clienteId as any) : undefined,
        contaBancariaId: formData.contaBancariaId ? (formData.contaBancariaId as any) : undefined,
        formaPagamento: formData.formaPagamento ? (formData.formaPagamento as any) : undefined,
        notaFiscal: formData.notaFiscal || undefined,
        observacoes: formData.observacoes || undefined,
      });
      toast.success("Conta atualizada com sucesso");
      setEditingConta(null);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar conta");
    }
  };

  const handleReceber = async () => {
    if (!isRecebimentoOpen) return;
    try {
      const valorCents = Math.round(parseFloat(recebimentoData.valorRecebido.replace(",", ".")) * 100);
      if (isNaN(valorCents) || valorCents <= 0) {
        toast.error("Informe um valor válido");
        return;
      }
      await receberConta({
        id: isRecebimentoOpen._id,
        valorRecebido: valorCents,
        dataRecebimento: new Date(recebimentoData.dataRecebimento).getTime(),
        formaPagamento: recebimentoData.formaPagamento
          ? (recebimentoData.formaPagamento as any)
          : undefined,
        contaBancariaId: recebimentoData.contaBancariaId
          ? (recebimentoData.contaBancariaId as any)
          : undefined,
      });
      toast.success("Recebimento registrado");
      setIsRecebimentoOpen(null);
    } catch (error: any) {
      toast.error(error.message || "Erro ao registrar recebimento");
    }
  };

  const handleCancelar = async (id: any) => {
    if (!confirm("Deseja realmente cancelar esta conta a receber?")) return;
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
      dataEmissao: new Date(conta.dataEmissao).toISOString().split("T")[0],
      categoriaId: conta.categoriaId ?? "",
      clienteId: conta.clienteId ?? "",
      contaBancariaId: conta.contaBancariaId ?? "",
      formaPagamento: conta.formaPagamento ?? "",
      notaFiscal: conta.notaFiscal ?? "",
      observacoes: conta.observacoes ?? "",
    });
  };

  const FormFields = ({ prefix }: { prefix: string }) => (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor={`${prefix}-descricao`}>Descrição</Label>
        <Input
          id={`${prefix}-descricao`}
          placeholder="Ex: Serviço de consultoria, Mensalidade..."
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
      <div className="grid grid-cols-3 gap-4">
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-dataEmissao`}>Data de Emissão</Label>
          <Input
            id={`${prefix}-dataEmissao`}
            type="date"
            value={formData.dataEmissao}
            onChange={(e) => setFormData({ ...formData, dataEmissao: e.target.value })}
          />
        </div>
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
          <Label htmlFor={`${prefix}-dataCompetencia`}>Competência</Label>
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
          <Label htmlFor={`${prefix}-clienteId`}>Cliente</Label>
          <Select
            value={formData.clienteId}
            onValueChange={(v) => setFormData({ ...formData, clienteId: v })}
          >
            <SelectTrigger id={`${prefix}-clienteId`}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {(clientes ?? []).map((c) => (
                <SelectItem key={c._id} value={c._id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
              {(categorias ?? [])
                .filter((cat) => cat.tipo === "receita" || cat.tipo === "ambos")
                .map((cat) => (
                  <SelectItem key={cat._id} value={cat._id}>
                    {cat.nome}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
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
          <Label htmlFor={`${prefix}-notaFiscal`}>Nota Fiscal</Label>
          <Input
            id={`${prefix}-notaFiscal`}
            placeholder="Número da NF (opcional)"
            value={formData.notaFiscal}
            onChange={(e) => setFormData({ ...formData, notaFiscal: e.target.value })}
          />
        </div>
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
          <h1 className="text-2xl font-bold">Contas a Receber</h1>
          <p className="text-muted-foreground">Gerencie seus recebíveis</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Conta a Receber
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Nova Conta a Receber</DialogTitle>
              <DialogDescription>Preencha os dados do recebível</DialogDescription>
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
            <DialogTitle>Editar Conta a Receber</DialogTitle>
            <DialogDescription>Atualize os dados do recebível</DialogDescription>
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

      <Dialog open={!!isRecebimentoOpen} onOpenChange={(open) => !open && setIsRecebimentoOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Recebimento</DialogTitle>
            <DialogDescription>
              {isRecebimentoOpen?.descricao} — Total: {formatCurrency(isRecebimentoOpen?.valor ?? 0)}
              {isRecebimentoOpen?.valorRecebido > 0 && (
                <> | Já recebido: {formatCurrency(isRecebimentoOpen.valorRecebido)} | Saldo: {formatCurrency((isRecebimentoOpen.valor ?? 0) - (isRecebimentoOpen.valorRecebido ?? 0))}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="rec-valor">Valor Recebido (R$)</Label>
              <Input
                id="rec-valor"
                placeholder="0,00"
                value={recebimentoData.valorRecebido}
                onChange={(e) =>
                  setRecebimentoData({ ...recebimentoData, valorRecebido: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rec-data">Data do Recebimento</Label>
              <Input
                id="rec-data"
                type="date"
                value={recebimentoData.dataRecebimento}
                onChange={(e) =>
                  setRecebimentoData({ ...recebimentoData, dataRecebimento: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rec-forma">Forma de Pagamento</Label>
              <Select
                value={recebimentoData.formaPagamento}
                onValueChange={(v) =>
                  setRecebimentoData({ ...recebimentoData, formaPagamento: v })
                }
              >
                <SelectTrigger id="rec-forma">
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
              <Label htmlFor="rec-conta">Conta Bancária</Label>
              <Select
                value={recebimentoData.contaBancariaId}
                onValueChange={(v) =>
                  setRecebimentoData({ ...recebimentoData, contaBancariaId: v })
                }
              >
                <SelectTrigger id="rec-conta">
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
            <Button variant="outline" onClick={() => setIsRecebimentoOpen(null)}>
              Cancelar
            </Button>
            <Button onClick={handleReceber} className="bg-emerald-600 hover:bg-emerald-700">
              <DollarSign className="h-4 w-4 mr-2" />
              Confirmar Recebimento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por descrição, cliente ou NF..."
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
            <SelectItem value="Emitido">Emitido</SelectItem>
            <SelectItem value="Parcial">Parcial</SelectItem>
            <SelectItem value="Recebido">Recebido</SelectItem>
            <SelectItem value="Vencido">Vencido</SelectItem>
            <SelectItem value="Cancelado">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Lista de Contas a Receber</span>
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
              <ArrowDownToLine className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-muted-foreground">Nenhuma conta a receber encontrada</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>NF</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Recebido</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContas.map((conta) => {
                  const cfg = statusConfig[conta.status] ?? statusConfig.Emitido;
                  const isOverdue =
                    (conta.status === "Emitido" || conta.status === "Parcial") &&
                    conta.dataVencimento < Date.now();
                  return (
                    <TableRow key={conta._id}>
                      <TableCell className="font-medium max-w-[180px] truncate">
                        {conta.descricao}
                      </TableCell>
                      <TableCell>{conta.cliente?.nome ?? "-"}</TableCell>
                      <TableCell className="text-xs">{conta.notaFiscal ?? "-"}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(conta.valor)}
                      </TableCell>
                      <TableCell className="text-right">
                        {conta.valorRecebido > 0 ? (
                          <span className="text-emerald-600 font-medium">
                            {formatCurrency(conta.valorRecebido)}
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={isOverdue ? "text-red-600 font-medium" : ""}>
                          {formatDate(conta.dataVencimento)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${isOverdue && conta.status !== "Vencido" ? statusConfig.Vencido.className : cfg.className}`}>
                          {isOverdue && conta.status !== "Vencido" ? "Vencido" : cfg.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {conta.status !== "Recebido" && conta.status !== "Cancelado" && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Registrar Recebimento"
                              onClick={() => {
                                setIsRecebimentoOpen(conta);
                                const saldo = conta.valor - conta.valorRecebido;
                                setRecebimentoData({
                                  valorRecebido: (saldo / 100).toFixed(2).replace(".", ","),
                                  dataRecebimento: new Date().toISOString().split("T")[0],
                                  formaPagamento: conta.formaPagamento ?? "",
                                  contaBancariaId: conta.contaBancariaId ?? "",
                                });
                              }}
                            >
                              <DollarSign className="h-4 w-4 text-emerald-600" />
                            </Button>
                          )}
                          {conta.status !== "Recebido" && conta.status !== "Cancelado" && (
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
