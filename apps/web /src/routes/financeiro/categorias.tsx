import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated, useQuery, useMutation } from "convex/react";
import { Plus, Pencil, ToggleLeft, ToggleRight } from "lucide-react";
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

export const Route = createFileRoute("/financeiro/categorias")({
  component: CategoriasPage,
});

const tipoLabels: Record<string, string> = {
  despesa: "Despesa",
  receita: "Receita",
  ambos: "Ambos",
};

const tipoColors: Record<string, string> = {
  despesa: "bg-red-100 text-red-800",
  receita: "bg-emerald-100 text-emerald-800",
  ambos: "bg-blue-100 text-blue-800",
};

function CategoriasPage() {
  return (
    <>
      <Authenticated>
        <CategoriasContent />
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

function CategoriasContent() {
  const categorias = useQuery(api.categoriasFinanceiras.list, {});
  const createCategoria = useMutation(api.categoriasFinanceiras.create);
  const updateCategoria = useMutation(api.categoriasFinanceiras.update);
  const toggleCategoria = useMutation(api.categoriasFinanceiras.toggleActive);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCategoria, setEditingCategoria] = useState<any>(null);

  const [formData, setFormData] = useState({
    nome: "",
    tipo: "despesa" as string,
    cor: "",
  });

  const resetForm = () => {
    setFormData({ nome: "", tipo: "despesa", cor: "" });
  };

  const handleCreate = async () => {
    try {
      if (!formData.nome.trim()) {
        toast.error("O nome é obrigatório");
        return;
      }
      await createCategoria({
        nome: formData.nome,
        tipo: formData.tipo as any,
        cor: formData.cor || undefined,
      });
      toast.success("Categoria criada com sucesso");
      setIsCreateOpen(false);
      resetForm();
    } catch (error) {
      toast.error("Erro ao criar categoria");
    }
  };

  const handleUpdate = async () => {
    if (!editingCategoria) return;
    try {
      await updateCategoria({
        id: editingCategoria._id,
        nome: formData.nome,
        tipo: formData.tipo as any,
        cor: formData.cor || undefined,
      });
      toast.success("Categoria atualizada com sucesso");
      setEditingCategoria(null);
      resetForm();
    } catch (error) {
      toast.error("Erro ao atualizar categoria");
    }
  };

  const handleToggle = async (id: any) => {
    try {
      await toggleCategoria({ id });
      toast.success("Status alterado");
    } catch (error) {
      toast.error("Erro ao alterar status");
    }
  };

  const openEdit = (cat: any) => {
    setEditingCategoria(cat);
    setFormData({
      nome: cat.nome,
      tipo: cat.tipo,
      cor: cat.cor ?? "",
    });
  };

  const FormFields = ({ prefix }: { prefix: string }) => (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor={`${prefix}-nome`}>Nome</Label>
        <Input
          id={`${prefix}-nome`}
          placeholder="Ex: Fornecedores, Impostos, Aluguel..."
          value={formData.nome}
          onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
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
              <SelectItem value="despesa">Despesa</SelectItem>
              <SelectItem value="receita">Receita</SelectItem>
              <SelectItem value="ambos">Ambos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-cor`}>Cor (hex)</Label>
          <div className="flex gap-2">
            <Input
              id={`${prefix}-cor`}
              placeholder="#ef4444"
              value={formData.cor}
              onChange={(e) => setFormData({ ...formData, cor: e.target.value })}
            />
            {formData.cor && (
              <div
                className="h-9 w-9 rounded-md border shrink-0"
                style={{ backgroundColor: formData.cor }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Categorias Financeiras</h1>
          <p className="text-muted-foreground">Organize seus lançamentos por categoria</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Categoria
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Categoria</DialogTitle>
              <DialogDescription>Crie uma nova categoria financeira</DialogDescription>
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

      <Dialog open={!!editingCategoria} onOpenChange={(open) => !open && setEditingCategoria(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Categoria</DialogTitle>
            <DialogDescription>Atualize os dados da categoria</DialogDescription>
          </DialogHeader>
          <FormFields prefix="edit" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCategoria(null)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdate}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Categorias</CardTitle>
        </CardHeader>
        <CardContent>
          {!categorias ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : categorias.length === 0 ? (
            <p className="text-muted-foreground">Nenhuma categoria cadastrada</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cor</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categorias.map((cat) => (
                  <TableRow key={cat._id}>
                    <TableCell>
                      <div
                        className="h-5 w-5 rounded-full border"
                        style={{ backgroundColor: cat.cor ?? "#94a3b8" }}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{cat.nome}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tipoColors[cat.tipo] ?? ""}`}>
                        {tipoLabels[cat.tipo] ?? cat.tipo}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={cat.isActive ? "success" : "secondary"}>
                        {cat.isActive ? "Ativa" : "Inativa"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(cat)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => handleToggle(cat._id)}>
                          {cat.isActive ? (
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
