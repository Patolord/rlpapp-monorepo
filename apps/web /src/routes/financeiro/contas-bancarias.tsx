import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated, useQuery, useMutation } from "convex/react";
import { Plus, Pencil, ToggleLeft, ToggleRight, Landmark } from "lucide-react";
import { useState } from "react";
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

export const Route = createFileRoute("/financeiro/contas-bancarias")({
  component: ContasBancariasPage,
});

const tipoLabels: Record<string, string> = {
  corrente: "Conta Corrente",
  poupanca: "Poupança",
};

function ContasBancariasPage() {
  return (
    <>
      <Authenticated>
        <ContasBancariasContent />
      </Authenticated>
      <Unauthenticated>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Faça login para acessar</p>
        </div>
      </Unauthenticated>
      <AuthLoading>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </AuthLoading>
    </>
  );
}

function ContasBancariasContent() {
  const contas = useQuery(api.contasBancarias.list, {});
  const createConta = useMutation(api.contasBancarias.create);
  const updateConta = useMutation(api.contasBancarias.update);
  const toggleConta = useMutation(api.contasBancarias.toggleActive);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingConta, setEditingConta] = useState<any>(null);

  const [formData, setFormData] = useState({
    nome: "",
    banco: "",
    agencia: "",
    conta: "",
    tipo: "corrente" as string,
    saldoInicial: "",
  });

  const resetForm = () => {
    setFormData({
      nome: "",
      banco: "",
      agencia: "",
      conta: "",
      tipo: "corrente",
      saldoInicial: "",
    });
  };

  const handleCreate = async () => {
    try {
      if (!formData.nome.trim() || !formData.banco.trim()) {
        toast.error("Nome e banco são obrigatórios");
        return;
      }
      const saldoCents = Math.round(
        parseFloat(formData.saldoInicial.replace(",", ".") || "0") * 100
      );
      await createConta({
        nome: formData.nome,
        banco: formData.banco,
        agencia: formData.agencia,
        conta: formData.conta,
        tipo: formData.tipo as any,
        saldoInicial: saldoCents,
      });
      toast.success("Conta bancária criada com sucesso");
      setIsCreateOpen(false);
      resetForm();
    } catch (error) {
      toast.error("Erro ao criar conta bancária");
    }
  };

  const handleUpdate = async () => {
    if (!editingConta) return;
    try {
      const saldoCents = Math.round(
        parseFloat(formData.saldoInicial.replace(",", ".") || "0") * 100
      );
      await updateConta({
        id: editingConta._id,
        nome: formData.nome,
        banco: formData.banco,
        agencia: formData.agencia,
        conta: formData.conta,
        tipo: formData.tipo as any,
        saldoInicial: saldoCents,
      });
      toast.success("Conta bancária atualizada");
      setEditingConta(null);
      resetForm();
    } catch (error) {
      toast.error("Erro ao atualizar conta bancária");
    }
  };

  const handleToggle = async (id: any) => {
    try {
      await toggleConta({ id });
      toast.success("Status alterado");
    } catch (error) {
      toast.error("Erro ao alterar status");
    }
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

  const FormFields = ({ prefix }: { prefix: string }) => (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor={`${prefix}-nome`}>Nome da Conta</Label>
        <Input
          id={`${prefix}-nome`}
          placeholder="Ex: Conta Principal, Conta Pagamentos..."
          value={formData.nome}
          onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-banco`}>Banco</Label>
          <Input
            id={`${prefix}-banco`}
            placeholder="Ex: Itaú, Bradesco, Nubank..."
            value={formData.banco}
            onChange={(e) => setFormData({ ...formData, banco: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-tipo`}>Tipo</Label>
          <Select
            value={formData.tipo}
            onValueChange={(v) => setFormData({ ...formData, tipo: v })}
          >
            <SelectTrigger id={`${prefix}-tipo`}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="corrente">Conta Corrente</SelectItem>
              <SelectItem value="poupanca">Poupança</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-agencia`}>Agência</Label>
          <Input
            id={`${prefix}-agencia`}
            placeholder="0001"
            value={formData.agencia}
            onChange={(e) => setFormData({ ...formData, agencia: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-conta`}>Conta</Label>
          <Input
            id={`${prefix}-conta`}
            placeholder="12345-6"
            value={formData.conta}
            onChange={(e) => setFormData({ ...formData, conta: e.target.value })}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${prefix}-saldo`}>Saldo Inicial (R$)</Label>
        <Input
          id={`${prefix}-saldo`}
          placeholder="0,00"
          value={formData.saldoInicial}
          onChange={(e) => setFormData({ ...formData, saldoInicial: e.target.value })}
        />
      </div>
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contas Bancárias</h1>
          <p className="text-muted-foreground">Gerencie as contas bancárias da empresa</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Conta
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Conta Bancária</DialogTitle>
              <DialogDescription>Cadastre uma nova conta bancária</DialogDescription>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Conta Bancária</DialogTitle>
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

      <Card>
        <CardHeader>
          <CardTitle>Lista de Contas Bancárias</CardTitle>
        </CardHeader>
        <CardContent>
          {!contas ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : contas.length === 0 ? (
            <div className="text-center py-8">
              <Landmark className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-muted-foreground">Nenhuma conta bancária cadastrada</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Banco</TableHead>
                  <TableHead>Agência</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Saldo Inicial</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contas.map((conta) => (
                  <TableRow key={conta._id}>
                    <TableCell className="font-medium">{conta.nome}</TableCell>
                    <TableCell>{conta.banco}</TableCell>
                    <TableCell>{conta.agencia}</TableCell>
                    <TableCell>{conta.conta}</TableCell>
                    <TableCell>{tipoLabels[conta.tipo] ?? conta.tipo}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(conta.saldoInicial)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={conta.isActive ? "success" : "secondary"}>
                        {conta.isActive ? "Ativa" : "Inativa"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(conta)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => handleToggle(conta._id)}>
                          {conta.isActive ? (
                            <ToggleRight className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
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
