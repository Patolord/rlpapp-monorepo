import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { FileUp, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth-shell";
import { CsvImportDialog } from "@/components/compras/csv-import-dialog";
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
import { splitList } from "@/lib/csv";

const SUPPLIER_COLUMN_ALIASES = {
  name: ["name", "nome", "fornecedor"],
  categories: ["categories", "categorias", "categoria"],
  notes: ["notes", "observacoes", "observações", "obs"],
  contactName: ["contactname", "contato", "contact_name", "nome_contato"],
  contactEmail: ["contactemail", "email", "contact_email", "email_contato"],
  contactWhatsapp: ["contactwhatsapp", "whatsapp", "contact_whatsapp", "telefone"],
  contactRole: ["contactrole", "cargo", "contact_role", "funcao"],
} as const;

const SUPPLIER_TEMPLATE_HEADERS = [
  "name",
  "categories",
  "notes",
  "contactName",
  "contactEmail",
  "contactWhatsapp",
  "contactRole",
];

type SupplierImportItem = {
  name: string;
  categories?: string[];
  notes?: string;
  contact?: {
    name: string;
    email?: string;
    whatsapp?: string;
    role?: string;
  };
};

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
  const bulkCreateSuppliers = useMutation(api.suppliers.bulkCreate);
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
        <div className="flex flex-wrap gap-2">
          <CsvImportDialog<SupplierImportItem>
            title="Importar fornecedores (CSV)"
            templateFilename="fornecedores.csv"
            templateHeaders={[...SUPPLIER_TEMPLATE_HEADERS]}
            templateSampleRow={[
              "Distribuidora XYZ",
              "Elétrica;HVAC",
              "Prazo 7 dias",
              "João",
              "joao@xyz.com",
              "5511999999999",
              "Comercial",
            ]}
            requiredColumns={["name"]}
            columnAliases={SUPPLIER_COLUMN_ALIASES}
            previewColumns={["name", "categories", "notes", "contactName"]}
            mapRow={(row, rowNumber) => {
              const name = row.name?.trim();
              if (!name) {
                return { ok: false, row: rowNumber, error: "Nome obrigatório" };
              }

              const contactName = row.contactName?.trim();
              const contact =
                contactName
                  ? {
                      name: contactName,
                      email: row.contactEmail?.trim() || undefined,
                      whatsapp: row.contactWhatsapp?.trim() || undefined,
                      role: row.contactRole?.trim() || undefined,
                    }
                  : undefined;

              return {
                ok: true,
                row: rowNumber,
                item: {
                  name,
                  categories: splitList(row.categories),
                  notes: row.notes?.trim() || undefined,
                  contact,
                },
              };
            }}
            onImportBatch={(items) => bulkCreateSuppliers({ items })}
            trigger={
              <Button variant="outline">
                <FileUp className="mr-2 size-4" />
                Importar CSV
              </Button>
            }
          />
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
