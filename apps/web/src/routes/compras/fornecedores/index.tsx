import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
import { getErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/compras/fornecedores/")({
  component: FornecedoresPage,
});

function FornecedoresPage() {
  return (
    <AuthShell>
      <FornecedoresContent />
    </AuthShell>
  );
}

function FornecedoresContent() {
  const suppliers = useQuery(api.suppliers.list, {});
  const createSupplier = useMutation(api.suppliers.create);
  const updateSupplier = useMutation(api.suppliers.update);

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    if (!suppliers) return [];
    if (!search.trim()) return suppliers;
    const term = search.toLowerCase();
    return suppliers.filter((s) => s.name.toLowerCase().includes(term));
  }, [suppliers, search]);

  async function handleCreate() {
    if (!form.name.trim()) {
      toast.error("Informe o nome");
      return;
    }
    setSubmitting(true);
    try {
      await createSupplier({ name: form.name, notes: form.notes || undefined });
      toast.success("Fornecedor criado");
      setOpen(false);
      setForm({ name: "", notes: "" });
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao criar fornecedor"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fornecedores</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro de fornecedores e contatos.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button><Plus className="mr-2 size-4" />Novo fornecedor</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo fornecedor</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Nome</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>Observações</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={submitting}>
                {submitting ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar fornecedores..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fornecedores</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Observações</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s._id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="max-w-xs truncate">{s.notes ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={s.active ? "default" : "secondary"}>
                      {s.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void updateSupplier({ supplierId: s._id, active: !s.active }).then(
                          () => toast.success(s.active ? "Fornecedor arquivado" : "Fornecedor reativado"),
                          (e) => toast.error(getErrorMessage(e, "Erro"))
                        )
                      }
                    >
                      {s.active ? "Arquivar" : "Reativar"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
