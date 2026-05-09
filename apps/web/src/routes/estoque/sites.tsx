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

export const Route = createFileRoute("/estoque/sites")({
  component: SitesPage,
});

function SitesPage() {
  return (
    <>
      <Authenticated>
        <SitesContent />
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

function SitesContent() {
  const sites = useQuery(api.sites.list, {});
  const createSite = useMutation(api.sites.create);
  const updateSite = useMutation(api.sites.update);
  const removeSite = useMutation(api.sites.remove);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<any>(null);

  const [formData, setFormData] = useState({
    name: "",
    address: "",
    responsibleName: "",
    responsiblePhone: "",
  });

  const resetForm = () => {
    setFormData({ name: "", address: "", responsibleName: "", responsiblePhone: "" });
  };

  const handleCreate = async () => {
    try {
      await createSite({
        name: formData.name,
        address: formData.address || undefined,
        responsibleName: formData.responsibleName || undefined,
        responsiblePhone: formData.responsiblePhone || undefined,
      });
      toast.success("Site criado com sucesso");
      setIsCreateOpen(false);
      resetForm();
    } catch (error) {
      toast.error("Erro ao criar site");
    }
  };

  const handleUpdate = async () => {
    if (!editingSite) return;
    try {
      await updateSite({
        id: editingSite._id,
        name: formData.name,
        address: formData.address || undefined,
        responsibleName: formData.responsibleName || undefined,
        responsiblePhone: formData.responsiblePhone || undefined,
      });
      toast.success("Site atualizado com sucesso");
      setEditingSite(null);
      resetForm();
    } catch (error) {
      toast.error("Erro ao atualizar site");
    }
  };

  const handleDelete = async (id: any) => {
    if (!confirm("Deseja realmente desativar este site?")) return;
    try {
      await removeSite({ id });
      toast.success("Site desativado com sucesso");
    } catch (error) {
      toast.error("Erro ao desativar site");
    }
  };

  const openEdit = (site: any) => {
    setEditingSite(site);
    setFormData({
      name: site.name,
      address: site.address || "",
      responsibleName: site.responsibleName || "",
      responsiblePhone: site.responsiblePhone || "",
    });
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sites</h1>
          <p className="text-muted-foreground">Gerencie os locais de entrega</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Site
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Site</DialogTitle>
              <DialogDescription>
                Preencha os dados do local de entrega
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Nome do Site</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="address">Endereço</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="responsibleName">Responsável</Label>
                  <Input
                    id="responsibleName"
                    value={formData.responsibleName}
                    onChange={(e) => setFormData({ ...formData, responsibleName: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="responsiblePhone">Telefone</Label>
                  <Input
                    id="responsiblePhone"
                    value={formData.responsiblePhone}
                    onChange={(e) => setFormData({ ...formData, responsiblePhone: e.target.value })}
                  />
                </div>
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
      <Dialog open={!!editingSite} onOpenChange={(open) => !open && setEditingSite(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Site</DialogTitle>
            <DialogDescription>
              Atualize os dados do local de entrega
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Nome do Site</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-address">Endereço</Label>
              <Input
                id="edit-address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-responsibleName">Responsável</Label>
                <Input
                  id="edit-responsibleName"
                  value={formData.responsibleName}
                  onChange={(e) => setFormData({ ...formData, responsibleName: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-responsiblePhone">Telefone</Label>
                <Input
                  id="edit-responsiblePhone"
                  value={formData.responsiblePhone}
                  onChange={(e) => setFormData({ ...formData, responsiblePhone: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSite(null)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdate}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Sites</CardTitle>
        </CardHeader>
        <CardContent>
          {!sites ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : sites.length === 0 ? (
            <p className="text-muted-foreground">Nenhum site cadastrado</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Endereço</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sites.map((site) => (
                  <TableRow key={site._id}>
                    <TableCell className="font-medium">{site.name}</TableCell>
                    <TableCell>{site.address || "-"}</TableCell>
                    <TableCell>{site.responsibleName || "-"}</TableCell>
                    <TableCell>{site.responsiblePhone || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={site.isActive ? "success" : "secondary"}>
                        {site.isActive ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEdit(site)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {site.isActive && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleDelete(site._id)}
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
