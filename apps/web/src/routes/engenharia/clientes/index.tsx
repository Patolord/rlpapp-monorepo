import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth-shell";
import { Badge } from "@/components/ui/badge";
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
import { getErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/engenharia/clientes/")({
  component: ClientesPage,
});

function ClientesPage() {
  return (
    <AuthShell>
      <ClientesContent />
    </AuthShell>
  );
}

function ClientesContent() {
  const customers = useQuery(api.customers.list, { activeOnly: false });
  const createCustomer = useMutation(api.customers.create);
  const updateCustomer = useMutation(api.customers.update);
  const archiveCustomer = useMutation(api.customers.archive);
  const restoreCustomer = useMutation(api.customers.restore);

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    legalName: "",
    taxId: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    if (!customers) return [];
    if (!search.trim()) return customers;
    const term = search.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        (c.legalName?.toLowerCase().includes(term) ?? false) ||
        (c.taxId?.includes(term) ?? false)
    );
  }, [customers, search]);

  async function handleCreate() {
    if (!form.name.trim()) {
      toast.error("Informe o nome");
      return;
    }
    setSubmitting(true);
    try {
      await createCustomer({
        name: form.name,
        legalName: form.legalName || undefined,
        taxId: form.taxId || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
        notes: form.notes || undefined,
      });
      toast.success("Cliente criado");
      setOpen(false);
      setForm({
        name: "",
        legalName: "",
        taxId: "",
        email: "",
        phone: "",
        address: "",
        notes: "",
      });
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao criar cliente"));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleArchive(
    customerId: (typeof filtered)[number]["_id"],
    archived: boolean
  ) {
    try {
      if (archived) {
        await restoreCustomer({ customerId });
        toast.success("Cliente reativado");
      } else {
        await archiveCustomer({ customerId });
        toast.success("Cliente arquivado");
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao atualizar cliente"));
    }
  }

  async function toggleActive(
    customerId: (typeof filtered)[number]["_id"],
    active: boolean
  ) {
    try {
      await updateCustomer({ customerId, active: !active });
      toast.success(active ? "Cliente desativado" : "Cliente ativado");
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao atualizar cliente"));
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro mestre de clientes para vincular às obras.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="mr-2 size-4" />
            Novo cliente
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Novo cliente</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="space-y-2">
                <Label htmlFor="customer-name">Nome</Label>
                <Input
                  id="customer-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-legal">Razão social</Label>
                <Input
                  id="customer-legal"
                  value={form.legalName}
                  onChange={(e) =>
                    setForm({ ...form, legalName: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="customer-tax">CNPJ/CPF</Label>
                  <Input
                    id="customer-tax"
                    value={form.taxId}
                    onChange={(e) =>
                      setForm({ ...form, taxId: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customer-phone">Telefone</Label>
                  <Input
                    id="customer-phone"
                    value={form.phone}
                    onChange={(e) =>
                      setForm({ ...form, phone: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-email">E-mail</Label>
                <Input
                  id="customer-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-address">Endereço</Label>
                <Input
                  id="customer-address"
                  value={form.address}
                  onChange={(e) =>
                    setForm({ ...form, address: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-notes">Observações</Label>
                <Input
                  id="customer-notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={submitting}>
                Criar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lista</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Buscar cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CNPJ/CPF</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((customer) => (
                <TableRow key={customer._id}>
                  <TableCell>
                    <div className="font-medium">{customer.name}</div>
                    {customer.legalName && (
                      <div className="text-xs text-muted-foreground">
                        {customer.legalName}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{customer.taxId ?? "—"}</TableCell>
                  <TableCell>
                    <div className="text-sm">{customer.email ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {customer.phone ?? ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    {customer.archivedAt ? (
                      <Badge variant="secondary">Arquivado</Badge>
                    ) : customer.active ? (
                      <Badge>Ativo</Badge>
                    ) : (
                      <Badge variant="outline">Inativo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {!customer.archivedAt && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            toggleActive(customer._id, customer.active)
                          }
                        >
                          {customer.active ? "Desativar" : "Ativar"}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          toggleArchive(customer._id, Boolean(customer.archivedAt))
                        }
                      >
                        {customer.archivedAt ? "Restaurar" : "Arquivar"}
                      </Button>
                    </div>
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
