import type { Dispatch, SetStateAction } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type PersonType = "pf" | "pj";

/** Campos cadastrais comuns a clientes e empreiteiros. */
export type PartySummary<PartyId extends string> = {
  _id: PartyId;
  name: string;
  personType: PersonType | null;
  legalName: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
  archivedAt: number | null;
};

export type PartyForm = {
  name: string;
  personType: "" | PersonType;
  legalName: string;
  taxId: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
};

export function partyToForm(party: PartySummary<string>): PartyForm {
  return {
    name: party.name,
    personType: party.personType ?? "",
    legalName: party.legalName ?? "",
    taxId: party.taxId ?? "",
    email: party.email ?? "",
    phone: party.phone ?? "",
    address: party.address ?? "",
    notes: party.notes ?? "",
  };
}

export function PartyInfoFields({
  form,
  setForm,
  isArchived,
  idPrefix,
}: {
  form: PartyForm;
  setForm: Dispatch<SetStateAction<PartyForm>>;
  isArchived: boolean;
  idPrefix: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-name`}>Nome</Label>
        <Input
          id={`${idPrefix}-name`}
          value={form.name}
          disabled={isArchived}
          onChange={(event) =>
            setForm((current) => ({ ...current, name: event.target.value }))
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-person-type`}>Tipo de pessoa</Label>
        <Select
          value={form.personType || "__none__"}
          disabled={isArchived}
          onValueChange={(value) =>
            setForm((current) => ({
              ...current,
              personType:
                value === "__none__" ? "" : (value as PersonType),
            }))
          }
        >
          <SelectTrigger id={`${idPrefix}-person-type`}>
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
        <Label htmlFor={`${idPrefix}-legal-name`}>Razão social</Label>
        <Input
          id={`${idPrefix}-legal-name`}
          value={form.legalName}
          disabled={isArchived}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              legalName: event.target.value,
            }))
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-tax-id`}>
          {form.personType === "pf"
            ? "CPF"
            : form.personType === "pj"
              ? "CNPJ"
              : "CPF/CNPJ"}
        </Label>
        <Input
          id={`${idPrefix}-tax-id`}
          value={form.taxId}
          disabled={isArchived}
          onChange={(event) =>
            setForm((current) => ({ ...current, taxId: event.target.value }))
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-email`}>E-mail da empresa</Label>
        <Input
          id={`${idPrefix}-email`}
          type="email"
          value={form.email}
          disabled={isArchived}
          onChange={(event) =>
            setForm((current) => ({ ...current, email: event.target.value }))
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-phone`}>Telefone da empresa</Label>
        <Input
          id={`${idPrefix}-phone`}
          value={form.phone}
          disabled={isArchived}
          onChange={(event) =>
            setForm((current) => ({ ...current, phone: event.target.value }))
          }
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-address`}>Endereço</Label>
        <Input
          id={`${idPrefix}-address`}
          value={form.address}
          disabled={isArchived}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              address: event.target.value,
            }))
          }
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-notes`}>Observações</Label>
        <Input
          id={`${idPrefix}-notes`}
          value={form.notes}
          disabled={isArchived}
          onChange={(event) =>
            setForm((current) => ({ ...current, notes: event.target.value }))
          }
        />
      </div>
    </div>
  );
}
