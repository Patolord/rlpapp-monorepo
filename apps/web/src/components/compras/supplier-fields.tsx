import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type PersonType = "pf" | "pj";

/** Estado do formulário de fornecedor (tudo string para os inputs). */
export type SupplierForm = {
  name: string;
  personType: "" | PersonType;
  legalName: string;
  taxId: string;
  stateRegistration: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  paymentTerms: string;
  defaultLeadTimeDays: string;
  categories: string;
  notes: string;
};

export const EMPTY_SUPPLIER_FORM: SupplierForm = {
  name: "",
  personType: "pj",
  legalName: "",
  taxId: "",
  stateRegistration: "",
  email: "",
  phone: "",
  website: "",
  address: "",
  paymentTerms: "",
  defaultLeadTimeDays: "",
  categories: "",
  notes: "",
};

export function splitCategories(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((c) => c.trim())
    .filter(Boolean);
}

/** Converte o prazo digitado em número inteiro ou `null` quando vazio. */
export function parseLeadTimeDays(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("Prazo padrão deve ser um número inteiro não negativo");
  }
  return parsed;
}

export function taxIdLabel(personType: "" | PersonType): string {
  if (personType === "pf") return "CPF";
  if (personType === "pj") return "CNPJ";
  return "CPF/CNPJ";
}

/**
 * Campos do cadastro de fornecedor, em grade de duas colunas.
 * Usado no diálogo de criação e no de edição.
 */
export function SupplierFields({
  idPrefix,
  form,
  onChange,
  disabled,
}: {
  idPrefix: string;
  form: SupplierForm;
  onChange: (next: SupplierForm) => void;
  disabled?: boolean;
}) {
  const set = <K extends keyof SupplierForm>(key: K, value: SupplierForm[K]) =>
    onChange({ ...form, [key]: value });
  const isPj = form.personType === "pj";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-person-type`}>Tipo de pessoa</Label>
        <Select
          value={form.personType || "__none__"}
          disabled={disabled}
          onValueChange={(value) =>
            set("personType", value === "__none__" ? "" : (value as PersonType))
          }
        >
          <SelectTrigger id={`${idPrefix}-person-type`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pj">Pessoa jurídica</SelectItem>
            <SelectItem value="pf">Pessoa física</SelectItem>
            <SelectItem value="__none__">Não informado</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-name`}>
          {isPj ? "Nome fantasia" : "Nome"} *
        </Label>
        <Input
          id={`${idPrefix}-name`}
          value={form.name}
          disabled={disabled}
          onChange={(e) => set("name", e.target.value)}
        />
      </div>
      {isPj && (
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${idPrefix}-legal-name`}>Razão social</Label>
          <Input
            id={`${idPrefix}-legal-name`}
            value={form.legalName}
            disabled={disabled}
            onChange={(e) => set("legalName", e.target.value)}
          />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-tax-id`}>{taxIdLabel(form.personType)}</Label>
        <Input
          id={`${idPrefix}-tax-id`}
          value={form.taxId}
          disabled={disabled}
          inputMode="numeric"
          placeholder={isPj ? "00.000.000/0000-00" : "000.000.000-00"}
          onChange={(e) => set("taxId", e.target.value)}
        />
      </div>
      {isPj && (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-state-registration`}>
            Inscrição estadual
          </Label>
          <Input
            id={`${idPrefix}-state-registration`}
            value={form.stateRegistration}
            disabled={disabled}
            onChange={(e) => set("stateRegistration", e.target.value)}
          />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-phone`}>Telefone</Label>
        <Input
          id={`${idPrefix}-phone`}
          value={form.phone}
          disabled={disabled}
          inputMode="tel"
          placeholder="(11) 4000-0000"
          onChange={(e) => set("phone", e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-email`}>E-mail</Label>
        <Input
          id={`${idPrefix}-email`}
          type="email"
          value={form.email}
          disabled={disabled}
          placeholder="vendas@fornecedor.com.br"
          onChange={(e) => set("email", e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-website`}>Site</Label>
        <Input
          id={`${idPrefix}-website`}
          value={form.website}
          disabled={disabled}
          inputMode="url"
          placeholder="fornecedor.com.br"
          onChange={(e) => set("website", e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-categories`}>Categorias</Label>
        <Input
          id={`${idPrefix}-categories`}
          value={form.categories}
          disabled={disabled}
          placeholder="Dutos, Cobre, Elétrica"
          onChange={(e) => set("categories", e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Separe por vírgula.</p>
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-address`}>Endereço</Label>
        <Input
          id={`${idPrefix}-address`}
          value={form.address}
          disabled={disabled}
          placeholder="Rua, número, bairro, cidade/UF, CEP"
          onChange={(e) => set("address", e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-payment-terms`}>
          Condições de pagamento
        </Label>
        <Input
          id={`${idPrefix}-payment-terms`}
          value={form.paymentTerms}
          disabled={disabled}
          placeholder="28 DDL, 30/60, à vista"
          onChange={(e) => set("paymentTerms", e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-lead-time`}>Prazo de entrega padrão (dias)</Label>
        <Input
          id={`${idPrefix}-lead-time`}
          type="number"
          min={0}
          step={1}
          value={form.defaultLeadTimeDays}
          disabled={disabled}
          onChange={(e) => set("defaultLeadTimeDays", e.target.value)}
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-notes`}>Observações</Label>
        <Textarea
          id={`${idPrefix}-notes`}
          rows={2}
          value={form.notes}
          disabled={disabled}
          onChange={(e) => set("notes", e.target.value)}
        />
      </div>
    </div>
  );
}
