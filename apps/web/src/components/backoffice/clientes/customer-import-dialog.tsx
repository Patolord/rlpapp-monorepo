import { api } from "@rlpapp/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { FileUp } from "lucide-react";

import { CsvImportDialog } from "@/components/compras/csv-import-dialog";
import { Button } from "@/components/ui/button";

const CUSTOMER_COLUMN_ALIASES = {
  name: ["name", "nome", "cliente"],
  personType: ["persontype", "person_type", "tipo", "pf/pj"],
  legalName: ["legalname", "legal_name", "razao social", "razão social"],
  taxId: ["taxid", "tax_id", "cnpj", "cpf", "cnpj/cpf"],
  email: ["email", "e-mail"],
  phone: ["phone", "telefone", "celular"],
  address: ["address", "endereco", "endereço"],
  notes: ["notes", "observacoes", "observações", "obs"],
  contactName: ["contactname", "contact_name", "nome_contato", "contato"],
  contactEmail: ["contactemail", "contact_email", "email_contato"],
  contactPhone: [
    "contactphone",
    "contact_phone",
    "telefone_contato",
    "celular_contato",
  ],
  contactRole: ["contactrole", "contact_role", "cargo", "funcao", "função"],
} as const;

const CUSTOMER_TEMPLATE_HEADERS = [
  "name",
  "personType",
  "legalName",
  "taxId",
  "email",
  "phone",
  "address",
  "notes",
  "contactName",
  "contactEmail",
  "contactPhone",
  "contactRole",
];

type CustomerImportItem = {
  name: string;
  personType?: "pf" | "pj";
  legalName?: string;
  taxId?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  contact?: {
    name: string;
    email?: string;
    phone?: string;
    role?: string;
  };
};

/** Importação de clientes por CSV (com modelo para download). */
export function CustomerImportDialog() {
  const bulkCreateCustomers = useMutation(api.customers.bulkCreate);

  return (
    <CsvImportDialog<CustomerImportItem>
      title="Importar clientes (CSV)"
      templateFilename="clientes.csv"
      templateHeaders={[...CUSTOMER_TEMPLATE_HEADERS]}
      templateSampleRow={[
        "Construtora Exemplo",
        "pj",
        "Construtora Exemplo Ltda.",
        "12.345.678/0001-90",
        "contato@construtora.com.br",
        "11999999999",
        "Av. Exemplo, 100",
        "Cliente prioritário",
        "Maria Silva",
        "maria@construtora.com.br",
        "11988888888",
        "Engenharia",
      ]}
      requiredColumns={["name"]}
      columnAliases={CUSTOMER_COLUMN_ALIASES}
      previewColumns={[
        "name",
        "personType",
        "legalName",
        "taxId",
        "email",
        "phone",
      ]}
      mapRow={(row, rowNumber) => {
        const name = row.name?.trim();
        if (!name) {
          return { ok: false, row: rowNumber, error: "Nome obrigatório" };
        }

        const contactName = row.contactName?.trim();
        const personTypeRaw = row.personType?.trim().toLowerCase();
        if (
          personTypeRaw &&
          personTypeRaw !== "pf" &&
          personTypeRaw !== "pj"
        ) {
          return {
            ok: false,
            row: rowNumber,
            error: "Tipo deve ser PF ou PJ",
          };
        }
        const contact = contactName
          ? {
              name: contactName,
              email: row.contactEmail?.trim() || undefined,
              phone: row.contactPhone?.trim() || undefined,
              role: row.contactRole?.trim() || undefined,
            }
          : undefined;

        return {
          ok: true,
          row: rowNumber,
          item: {
            name,
            personType:
              personTypeRaw === "pf" || personTypeRaw === "pj"
                ? personTypeRaw
                : undefined,
            legalName: row.legalName?.trim() || undefined,
            taxId: row.taxId?.trim() || undefined,
            email: row.email?.trim() || undefined,
            phone: row.phone?.trim() || undefined,
            address: row.address?.trim() || undefined,
            notes: row.notes?.trim() || undefined,
            contact,
          },
        };
      }}
      onImportBatch={(items) => bulkCreateCustomers({ items })}
      trigger={
        <Button variant="outline">
          <FileUp />
          Importar CSV
        </Button>
      }
    />
  );
}
