import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth-shell";
import { ContractorDetailDialog } from "@/components/engenharia/contractor-detail-dialog";
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
import { getErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/engenharia/empreiteiros/")({
  component: EmpreiteirosPage,
});

function EmpreiteirosPage() {
  return (
    <AuthShell>
      <EmpreiteirosContent />
    </AuthShell>
  );
}

function EmpreiteirosContent() {
  const contractors = useQuery(api.contractors.list, { activeOnly: false });
  const createContractor = useMutation(api.contractors.create);
  const updateContractor = useMutation(api.contractors.update);
  const archiveContractor = useMutation(api.contractors.archive);
  const restoreContractor = useMutation(api.contractors.restore);

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    personType: "" as "" | "pf" | "pj",
    legalName: "",
    taxId: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    if (!contractors) return [];
    if (!search.trim()) return contractors;
    const term = search.toLowerCase();
    return contractors.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        (c.legalName?.toLowerCase().includes(term) ?? false) ||
        (c.taxId?.includes(term) ?? false)
    );
  }, [contractors, search]);

  async function handleCreate() {
    if (!form.name.trim()) {
      toast.error("Informe o nome");
      return;
    }
    setSubmitting(true);
    try {
      await createContractor({
        name: form.name,
        personType: form.personType || undefined,
        legalName: form.legalName || undefined,
        taxId: form.taxId || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
        notes: form.notes || undefined,
      });
      toast.success("Empreiteiro criado");
      setOpen(false);
      setForm({
        name: "",
        personType: "",
        legalName: "",
        taxId: "",
        email: "",
        phone: "",
        address: "",
        notes: "",
      });
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao criar empreiteiro"));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleArchive(
    contractorId: (typeof filtered)[number]["_id"],
    archived: boolean
  ) {
    try {
      if (archived) {
        await restoreContractor({ contractorId });
        toast.success("Empreiteiro reativado");
      } else {
        await archiveContractor({ contractorId });
        toast.success("Empreiteiro arquivado");
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao atualizar empreiteiro"));
    }
  }

  async function toggleActive(
    contractorId: (typeof filtered)[number]["_id"],
    active: boolean
  ) {
    try {
      await updateContractor({ contractorId, active: !active });
      toast.success(active ? "Empreiteiro desativado" : "Empreiteiro ativado");
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao atualizar empreiteiro"));
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Empreiteiros</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro mestre de empreiteiros para contratos de contratação.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button />}>
              <Plus className="mr-2 size-4" />
              Novo empreiteiro
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Novo empreiteiro</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="space-y-2">
                  <Label htmlFor="contractor-name">Nome</Label>
                  <Input
                    id="contractor-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contractor-legal">Razão social</Label>
                  <Input
                    id="contractor-legal"
                    value={form.legalName}
                    onChange={(e) =>
                      setForm({ ...form, legalName: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="contractor-person-type">Tipo de pessoa</Label>
                    <Select
                      value={form.personType || "__none__"}
                      onValueChange={(value) =>
                        setForm({
                          ...form,
                          personType:
                            value === "__none__"
                              ? ""
                              : (value as "pf" | "pj"),
                        })
                      }
                    >
                      <SelectTrigger id="contractor-person-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Não informado</SelectItem>
                        <SelectItem value="pf">Pessoa física</SelectItem>
                        <SelectItem value="pj">Pessoa jurídica</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contractor-tax">
                      {form.personType === "pf"
                        ? "CPF"
                        : form.personType === "pj"
                          ? "CNPJ"
                          : "CPF/CNPJ"}
                    </Label>
                    <Input
                      id="contractor-tax"
                      value={form.taxId}
                      onChange={(e) =>
                        setForm({ ...form, taxId: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="contractor-phone">Telefone</Label>
                    <Input
                      id="contractor-phone"
                      value={form.phone}
                      onChange={(e) =>
                        setForm({ ...form, phone: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contractor-email">E-mail</Label>
                  <Input
                    id="contractor-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contractor-address">Endereço</Label>
                  <Input
                    id="contractor-address"
                    value={form.address}
                    onChange={(e) =>
                      setForm({ ...form, address: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contractor-notes">Observações</Label>
                  <Input
                    id="contractor-notes"
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
              placeholder="Buscar empreiteiro..."
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
              {filtered.map((contractor) => (
                <TableRow key={contractor._id}>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium">
                      {contractor.name}
                      {contractor.personType && (
                        <Badge variant="outline">
                          {contractor.personType.toUpperCase()}
                        </Badge>
                      )}
                    </div>
                    {contractor.legalName && (
                      <div className="text-xs text-muted-foreground">
                        {contractor.legalName}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{contractor.taxId ?? "—"}</TableCell>
                  <TableCell>
                    <div className="text-sm">{contractor.email ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {contractor.phone ?? ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    {contractor.archivedAt ? (
                      <Badge variant="secondary">Arquivado</Badge>
                    ) : contractor.active ? (
                      <Badge>Ativo</Badge>
                    ) : (
                      <Badge variant="outline">Inativo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <ContractorDetailDialog contractor={contractor} />
                      {!contractor.archivedAt && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            toggleActive(contractor._id, contractor.active)
                          }
                        >
                          {contractor.active ? "Desativar" : "Ativar"}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          toggleArchive(contractor._id, Boolean(contractor.archivedAt))
                        }
                      >
                        {contractor.archivedAt ? "Restaurar" : "Arquivar"}
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
