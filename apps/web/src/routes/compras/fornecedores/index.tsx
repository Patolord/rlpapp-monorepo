import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { FileUp, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth-shell";
import { CsvImportDialog } from "@/components/compras/csv-import-dialog";
import { SupplierDetailDialog } from "@/components/compras/supplier-detail-dialog";
import {
  EMPTY_SUPPLIER_FORM,
  type PersonType,
  type SupplierForm,
  SupplierFields,
  parseLeadTimeDays,
  splitCategories,
} from "@/components/compras/supplier-fields";
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
import { formatTaxId } from "@/lib/format-tax-id";
import { splitList } from "@/lib/csv";

const SUPPLIER_COLUMN_ALIASES = {
  name: ["name", "nome", "fornecedor", "nome_fantasia", "nomefantasia"],
  personType: ["persontype", "person_type", "tipo", "tipo_pessoa", "tipopessoa"],
  legalName: ["legalname", "legal_name", "razao_social", "razaosocial", "razão social", "razao social"],
  taxId: ["taxid", "tax_id", "cnpj", "cpf", "cnpj/cpf", "documento"],
  stateRegistration: ["stateregistration", "state_registration", "ie", "inscricao_estadual", "inscrição estadual"],
  email: ["email", "e-mail", "email_empresa"],
  phone: ["phone", "telefone", "fone", "telefone_empresa"],
  website: ["website", "site", "url"],
  address: ["address", "endereco", "endereço"],
  paymentTerms: ["paymentterms", "payment_terms", "condicoes", "condições", "condicao_pagamento", "pagamento"],
  defaultLeadTimeDays: ["defaultleadtimedays", "lead_time", "leadtime", "prazo", "prazo_entrega", "prazo_dias"],
  categories: ["categories", "categorias", "categoria"],
  notes: ["notes", "observacoes", "observações", "obs"],
  contactName: ["contactname", "contato", "contact_name", "nome_contato"],
  contactEmail: ["contactemail", "contact_email", "email_contato"],
  contactWhatsapp: ["contactwhatsapp", "whatsapp", "contact_whatsapp", "celular"],
  contactRole: ["contactrole", "cargo", "contact_role", "funcao"],
} as const;

const SUPPLIER_TEMPLATE_HEADERS = [
  "name",
  "personType",
  "legalName",
  "taxId",
  "stateRegistration",
  "email",
  "phone",
  "website",
  "address",
  "paymentTerms",
  "defaultLeadTimeDays",
  "categories",
  "notes",
  "contactName",
  "contactEmail",
  "contactWhatsapp",
  "contactRole",
];

type SupplierImportItem = {
  name: string;
  personType?: PersonType;
  legalName?: string;
  taxId?: string;
  stateRegistration?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  paymentTerms?: string;
  defaultLeadTimeDays?: number;
  categories?: string[];
  notes?: string;
  contact?: {
    name: string;
    email?: string;
    whatsapp?: string;
    role?: string;
  };
};

function parsePersonType(value: string | undefined): PersonType | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (["pj", "juridica", "jurídica", "pessoa juridica", "pessoa jurídica", "empresa"].includes(normalized)) {
    return "pj";
  }
  if (["pf", "fisica", "física", "pessoa fisica", "pessoa física"].includes(normalized)) {
    return "pf";
  }
  return undefined;
}

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
  const [form, setForm] = useState<SupplierForm>(EMPTY_SUPPLIER_FORM);
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    if (!suppliers) return [];
    const term = search.trim().toLowerCase();
    if (!term) return suppliers;
    const digits = term.replace(/\D/g, "");
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(term) ||
        (s.legalName?.toLowerCase().includes(term) ?? false) ||
        (s.categories?.some((c) => c.toLowerCase().includes(term)) ?? false) ||
        (digits.length >= 3 &&
          (s.taxId?.replace(/\D/g, "").includes(digits) ?? false))
    );
  }, [suppliers, search]);

  async function handleCreate() {
    if (!form.name.trim()) {
      toast.error("Informe o nome");
      return;
    }
    setSubmitting(true);
    try {
      await createSupplier({
        name: form.name,
        personType: form.personType || undefined,
        legalName: form.legalName || undefined,
        taxId: form.taxId || undefined,
        stateRegistration: form.stateRegistration || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        website: form.website || undefined,
        address: form.address || undefined,
        paymentTerms: form.paymentTerms || undefined,
        defaultLeadTimeDays: parseLeadTimeDays(form.defaultLeadTimeDays) ?? undefined,
        categories: splitCategories(form.categories),
        notes: form.notes || undefined,
      });
      toast.success("Fornecedor criado");
      setOpen(false);
      setForm(EMPTY_SUPPLIER_FORM);
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
            Cadastro de fornecedores, condições comerciais e contatos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CsvImportDialog<SupplierImportItem>
            title="Importar fornecedores (CSV)"
            templateFilename="fornecedores.csv"
            templateHeaders={[...SUPPLIER_TEMPLATE_HEADERS]}
            templateSampleRow={[
              "Distribuidora XYZ",
              "pj",
              "XYZ Comércio de Materiais LTDA",
              "11.222.333/0001-81",
              "123.456.789.000",
              "vendas@xyz.com",
              "(11) 4000-0000",
              "xyz.com.br",
              "Rua A, 100 - São Paulo/SP",
              "28 DDL",
              "7",
              "Elétrica;HVAC",
              "Entrega própria",
              "João",
              "joao@xyz.com",
              "5511999999999",
              "Comercial",
            ]}
            requiredColumns={["name"]}
            columnAliases={SUPPLIER_COLUMN_ALIASES}
            previewColumns={["name", "taxId", "categories", "paymentTerms", "contactName"]}
            mapRow={(row, rowNumber) => {
              const name = row.name?.trim();
              if (!name) {
                return { ok: false, row: rowNumber, error: "Nome obrigatório" };
              }

              let defaultLeadTimeDays: number | undefined;
              try {
                defaultLeadTimeDays =
                  parseLeadTimeDays(row.defaultLeadTimeDays ?? "") ?? undefined;
              } catch (error) {
                return {
                  ok: false,
                  row: rowNumber,
                  error: getErrorMessage(error, "Prazo inválido"),
                };
              }

              const contactName = row.contactName?.trim();
              const contact = contactName
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
                  personType: parsePersonType(row.personType),
                  legalName: row.legalName?.trim() || undefined,
                  taxId: row.taxId?.trim() || undefined,
                  stateRegistration: row.stateRegistration?.trim() || undefined,
                  email: row.email?.trim() || undefined,
                  phone: row.phone?.trim() || undefined,
                  website: row.website?.trim() || undefined,
                  address: row.address?.trim() || undefined,
                  paymentTerms: row.paymentTerms?.trim() || undefined,
                  defaultLeadTimeDays,
                  categories: splitList(row.categories),
                  notes: row.notes?.trim() || undefined,
                  contact,
                },
              };
            }}
            onImportBatch={(items) => bulkCreateSuppliers({ items })}
            trigger={
              <Button variant="outline">
                <FileUp />
                Importar CSV
              </Button>
            }
          />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button><Plus />Novo fornecedor</Button>} />
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Novo fornecedor</DialogTitle>
              </DialogHeader>
              <SupplierFields idPrefix="new-supplier" form={form} onChange={setForm} />
              <DialogFooter>
                <Button onClick={handleCreate} disabled={submitting || !form.name.trim()}>
                  {submitting ? "Salvando..." : "Salvar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Nome, razão social, CNPJ ou categoria..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fornecedores</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fornecedor</TableHead>
                <TableHead>CNPJ/CPF</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Categorias</TableHead>
                <TableHead>Condições</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    {suppliers === undefined
                      ? "Carregando..."
                      : search
                        ? "Nenhum fornecedor corresponde à busca."
                        : "Nenhum fornecedor cadastrado."}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((s) => (
                <TableRow key={s._id}>
                  <TableCell>
                    <div className="font-medium">{s.name}</div>
                    {s.legalName && s.legalName !== s.name && (
                      <div className="text-xs text-muted-foreground">{s.legalName}</div>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatTaxId(s.taxId) ?? "—"}</TableCell>
                  <TableCell>
                    {s.phone || s.email ? (
                      <div className="text-sm">
                        {s.phone && <div>{s.phone}</div>}
                        {s.email && (
                          <div className="truncate text-xs text-muted-foreground">{s.email}</div>
                        )}
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {s.categories && s.categories.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {s.categories.map((c) => (
                          <Badge key={c} variant="outline">{c}</Badge>
                        ))}
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{s.paymentTerms ?? "—"}</div>
                    {s.defaultLeadTimeDays !== null && (
                      <div className="text-xs text-muted-foreground">
                        Entrega em {s.defaultLeadTimeDays} dia{s.defaultLeadTimeDays === 1 ? "" : "s"}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.active ? "default" : "secondary"}>
                      {s.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <SupplierDetailDialog supplier={s} />
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
