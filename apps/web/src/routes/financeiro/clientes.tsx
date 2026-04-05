import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated, useQuery, useMutation } from "convex/react";
import { Plus, Pencil, ToggleLeft, ToggleRight, UserCheck } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/financeiro/clientes")({
  component: ClientesPage,
});

function ClientesPage() {
  return (
    <>
      <Authenticated>
        <ClientesContent />
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

function ClientesContent() {
  const clientes = useQuery(api.clientes.list, {});
  const createCliente = useMutation(api.clientes.create);
  const updateCliente = useMutation(api.clientes.update);
  const toggleCliente = useMutation(api.clientes.toggleActive);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<any>(null);

  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    phone: "",
    documento: "",
    endereco: "",
  });

  const resetForm = () => {
    setFormData({ nome: "", email: "", phone: "", documento: "", endereco: "" });
  };

  const handleCreate = async () => {
    try {
      if (!formData.nome.trim()) {
        toast.error("O nome é obrigatório");
        return;
      }
      await createCliente({
        nome: formData.nome,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        documento: formData.documento || undefined,
        endereco: formData.endereco || undefined,
      });
      toast.success("Cliente criado com sucesso");
      setIsCreateOpen(false);
      resetForm();
    } catch (error) {
      toast.error("Erro ao criar cliente");
    }
  };

  const handleUpdate = async () => {
    if (!editingCliente) return;
    try {
      await updateCliente({
        id: editingCliente._id,
        nome: formData.nome,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        documento: formData.documento || undefined,
        endereco: formData.endereco || undefined,
      });
      toast.success("Cliente atualizado com sucesso");
      setEditingCliente(null);
      resetForm();
    } catch (error) {
      toast.error("Erro ao atualizar cliente");
    }
  };

  const handleToggle = async (id: any) => {
    try {
      await toggleCliente({ id });
      toast.success("Status alterado");
    } catch (error) {
      toast.error("Erro ao alterar status");
    }
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

  const FormFields = ({ prefix }: { prefix: string }) => (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor={`${prefix}-nome`}>Nome</Label>
        <Input
          id={`${prefix}-nome`}
          placeholder="Nome do cliente ou empresa"
          value={formData.nome}
          onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-email`}>Email</Label>
          <Input
            id={`${prefix}-email`}
            type="email"
            placeholder="email@exemplo.com"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-phone`}>Telefone</Label>
          <Input
            id={`${prefix}-phone`}
            placeholder="(00) 00000-0000"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${prefix}-documento`}>CPF/CNPJ</Label>
        <Input
          id={`${prefix}-documento`}
          placeholder="000.000.000-00 ou 00.000.000/0001-00"
          value={formData.documento}
          onChange={(e) => setFormData({ ...formData, documento: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${prefix}-endereco`}>Endereço</Label>
        <Input
          id={`${prefix}-endereco`}
          placeholder="Endereço completo"
          value={formData.endereco}
          onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
        />
      </div>
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-muted-foreground">Gerencie os clientes da empresa</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Cliente
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Cliente</DialogTitle>
              <DialogDescription>Cadastre um novo cliente</DialogDescription>
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

      <Dialog open={!!editingCliente} onOpenChange={(open) => !open && setEditingCliente(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
            <DialogDescription>Atualize os dados do cliente</DialogDescription>
          </DialogHeader>
          <FormFields prefix="edit" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCliente(null)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdate}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Clientes</CardTitle>
        </CardHeader>
        <CardContent>
          {!clientes ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : clientes.length === 0 ? (
            <div className="text-center py-8">
              <UserCheck className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-muted-foreground">Nenhum cliente cadastrado</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CPF/CNPJ</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientes.map((cliente) => (
                  <TableRow key={cliente._id}>
                    <TableCell className="font-medium">{cliente.nome}</TableCell>
                    <TableCell>{cliente.documento || "-"}</TableCell>
                    <TableCell>{cliente.email || "-"}</TableCell>
                    <TableCell>{cliente.phone || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={cliente.isActive ? "success" : "secondary"}>
                        {cliente.isActive ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(cliente)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => handleToggle(cliente._id)}>
                          {cliente.isActive ? (
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
