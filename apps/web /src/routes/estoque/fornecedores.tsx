import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated, useQuery, useMutation } from "convex/react";
import { Plus, Pencil, Trash2 } from "lucide-react";
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
import { ConvexUnauthRedirect } from "@/components/convex-unauth-redirect";

export const Route = createFileRoute("/estoque/fornecedores")({
  component: FornecedoresPage,
});

function FornecedoresPage() {
  return (
    <>
      <Authenticated>
        <FornecedoresContent />
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

function FornecedoresContent() {
  const suppliers = useQuery(api.suppliers.list, {});
  const createSupplier = useMutation(api.suppliers.create);
  const updateSupplier = useMutation(api.suppliers.update);
  const removeSupplier = useMutation(api.suppliers.remove);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);

  const [formData, setFormData] = useState({
    name: "",
    contactName: "",
    email: "",
    phone: "",
    address: "",
  });

  const resetForm = () => {
    setFormData({ name: "", contactName: "", email: "", phone: "", address: "" });
  };

  const handleCreate = async () => {
    try {
      await createSupplier({
        name: formData.name,
        contactName: formData.contactName || undefined,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        address: formData.address || undefined,
      });
      toast.success("Fornecedor criado com sucesso");
      setIsCreateOpen(false);
      resetForm();
    } catch (error) {
      toast.error("Erro ao criar fornecedor");
    }
  };

  const handleUpdate = async () => {
    if (!editingSupplier) return;
    try {
      await updateSupplier({
        id: editingSupplier._id,
        name: formData.name,
        contactName: formData.contactName || undefined,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        address: formData.address || undefined,
      });
      toast.success("Fornecedor atualizado com sucesso");
      setEditingSupplier(null);
      resetForm();
    } catch (error) {
      toast.error("Erro ao atualizar fornecedor");
    }
  };

  const handleDelete = async (id: any) => {
    if (!confirm("Deseja realmente desativar este fornecedor?")) return;
    try {
      await removeSupplier({ id });
      toast.success("Fornecedor desativado com sucesso");
    } catch (error) {
      toast.error("Erro ao desativar fornecedor");
    }
  };

  const openEdit = (supplier: any) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      contactName: supplier.contactName || "",
      email: supplier.email || "",
      phone: supplier.phone || "",
      address: supplier.address || "",
    });
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fornecedores</h1>
          <p className="text-muted-foreground">Gerencie os fornecedores</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Fornecedor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Fornecedor</DialogTitle>
              <DialogDescription>
                Preencha os dados do fornecedor
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Nome da Empresa</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="contactName">Nome do Contato</Label>
                <Input
                  id="contactName"
                  value={formData.contactName}
                  onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="address">Endereço</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate}>Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingSupplier} onOpenChange={(open) => !open && setEditingSupplier(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Fornecedor</DialogTitle>
            <DialogDescription>
              Atualize os dados do fornecedor
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Nome da Empresa</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-contactName">Nome do Contato</Label>
              <Input
                id="edit-contactName"
                value={formData.contactName}
                onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-phone">Telefone</Label>
                <Input
                  id="edit-phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-address">Endereço</Label>
              <Input
                id="edit-address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSupplier(null)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdate}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Fornecedores</CardTitle>
        </CardHeader>
        <CardContent>
          {!suppliers ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : suppliers.length === 0 ? (
            <p className="text-muted-foreground">Nenhum fornecedor cadastrado</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((supplier) => (
                  <TableRow key={supplier._id}>
                    <TableCell className="font-medium">{supplier.name}</TableCell>
                    <TableCell>{supplier.contactName || "-"}</TableCell>
                    <TableCell>{supplier.email || "-"}</TableCell>
                    <TableCell>{supplier.phone || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={supplier.isActive ? "success" : "secondary"}>
                        {supplier.isActive ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEdit(supplier)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {supplier.isActive && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleDelete(supplier._id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
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
