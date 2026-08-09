import { useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Archive, History, Loader2, Pencil, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { getErrorMessage } from "@/lib/errors";

type PersonType = "pf" | "pj";

export type ContractorSummary = {
  _id: Id<"contractors">;
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

type ContractorForm = {
  name: string;
  personType: "" | PersonType;
  legalName: string;
  taxId: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
};

type ContactForm = {
  contactId: Id<"contractorContacts"> | null;
  name: string;
  email: string;
  phone: string;
  role: string;
};

const EMPTY_CONTACT: ContactForm = {
  contactId: null,
  name: "",
  email: "",
  phone: "",
  role: "",
};

function contractorToForm(contractor: ContractorSummary): ContractorForm {
  return {
    name: contractor.name,
    personType: contractor.personType ?? "",
    legalName: contractor.legalName ?? "",
    taxId: contractor.taxId ?? "",
    email: contractor.email ?? "",
    phone: contractor.phone ?? "",
    address: contractor.address ?? "",
    notes: contractor.notes ?? "",
  };
}

export function ContractorDetailDialog({
  contractor,
}: {
  contractor: ContractorSummary;
}) {
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [form, setForm] = useState<ContractorForm>(() => contractorToForm(contractor));
  const [contactForm, setContactForm] =
    useState<ContactForm>(EMPTY_CONTACT);
  const [saving, setSaving] = useState(false);
  const isArchived = contractor.archivedAt !== null;
  const idPrefix = `contractor-${contractor._id}`;

  const details = useQuery(
    api.contractors.get,
    open
      ? {
          contractorId: contractor._id,
          includeInactiveContacts: showHistory,
        }
      : "skip"
  );
  const updateContractor = useMutation(api.contractors.update);
  const addContact = useMutation(api.contractors.addContact);
  const updateContact = useMutation(api.contractors.updateContact);
  const archiveContact = useMutation(api.contractors.removeContact);
  const restoreContact = useMutation(api.contractors.restoreContact);

  function reset(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setForm(contractorToForm(contractor));
      setContactForm(EMPTY_CONTACT);
      setShowHistory(false);
    }
  }

  async function saveContractor() {
    if (isArchived || !form.name.trim()) return;
    setSaving(true);
    try {
      await updateContractor({
        contractorId: contractor._id,
        name: form.name,
        personType: form.personType || null,
        legalName: form.legalName,
        taxId: form.taxId || null,
        email: form.email,
        phone: form.phone,
        address: form.address,
        notes: form.notes,
      });
      toast.success("Empreiteiro atualizado");
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao atualizar empreiteiro"));
    } finally {
      setSaving(false);
    }
  }

  async function saveContact() {
    if (isArchived || !contactForm.name.trim()) return;
    setSaving(true);
    try {
      if (contactForm.contactId) {
        await updateContact({
          contactId: contactForm.contactId,
          name: contactForm.name,
          email: contactForm.email || null,
          phone: contactForm.phone || null,
          role: contactForm.role || null,
        });
        toast.success("Contato atualizado");
      } else {
        await addContact({
          contractorId: contractor._id,
          name: contactForm.name,
          email: contactForm.email || undefined,
          phone: contactForm.phone || undefined,
          role: contactForm.role || undefined,
        });
        toast.success("Contato adicionado");
      }
      setContactForm(EMPTY_CONTACT);
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao salvar contato"));
    } finally {
      setSaving(false);
    }
  }

  async function setContactActive(
    contactId: Id<"contractorContacts">,
    active: boolean
  ) {
    if (isArchived && !active) return;
    try {
      if (active) {
        await archiveContact({ contactId });
        toast.success("Contato movido para o histórico");
      } else {
        await restoreContact({ contactId });
        toast.success("Contato restaurado");
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao atualizar contato"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="mr-1.5 size-3.5" />
          Gerenciar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{contractor.name}</DialogTitle>
          <DialogDescription>
            Dados cadastrais e contatos atuais ou históricos do empreiteiro.
          </DialogDescription>
        </DialogHeader>

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

        {!isArchived && (
          <div className="flex justify-end">
            <Button onClick={saveContractor} disabled={saving || !form.name.trim()}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Salvar dados
            </Button>
          </div>
        )}

        <div className="space-y-3 border-t pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold">Pessoas de contato</h3>
              <p className="text-sm text-muted-foreground">
                Contatos removidos permanecem no histórico.
              </p>
            </div>
            <Button
              variant={showHistory ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowHistory((current) => !current)}
            >
              <History className="mr-1.5 size-4" />
              {showHistory ? "Mostrar ativos" : "Ver histórico"}
            </Button>
          </div>

          {details === undefined ? (
            <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
          ) : details && details.contacts.length > 0 ? (
            <div className="divide-y rounded-md border">
              {details.contacts.map((contact) => (
                <div
                  key={contact._id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{contact.name}</span>
                      {!contact.active && (
                        <Badge variant="secondary">Histórico</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {[contact.role, contact.email, contact.phone]
                        .filter(Boolean)
                        .join(" · ") || "Sem detalhes"}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {contact.active && !isArchived && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setContactForm({
                            contactId: contact._id,
                            name: contact.name,
                            email: contact.email ?? "",
                            phone: contact.phone ?? "",
                            role: contact.role ?? "",
                          })
                        }
                      >
                        <Pencil className="mr-1.5 size-3.5" />
                        Editar
                      </Button>
                    )}
                    {(contact.active || !isArchived) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setContactActive(contact._id, contact.active)
                        }
                      >
                        {contact.active ? (
                          <Archive className="mr-1.5 size-3.5" />
                        ) : (
                          <RotateCcw className="mr-1.5 size-3.5" />
                        )}
                        {contact.active ? "Arquivar" : "Restaurar"}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              Nenhum contato {showHistory ? "registrado" : "ativo"}.
            </p>
          )}

          {!isArchived && (
            <div className="grid gap-2 rounded-md bg-muted/40 p-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={`${idPrefix}-contact-name`}>Nome</Label>
                <Input
                  id={`${idPrefix}-contact-name`}
                  value={contactForm.name}
                  onChange={(event) =>
                    setContactForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${idPrefix}-contact-role`}>
                  Cargo / função
                </Label>
                <Input
                  id={`${idPrefix}-contact-role`}
                  value={contactForm.role}
                  onChange={(event) =>
                    setContactForm((current) => ({
                      ...current,
                      role: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${idPrefix}-contact-email`}>E-mail</Label>
                <Input
                  id={`${idPrefix}-contact-email`}
                  type="email"
                  value={contactForm.email}
                  onChange={(event) =>
                    setContactForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${idPrefix}-contact-phone`}>Telefone</Label>
                <Input
                  id={`${idPrefix}-contact-phone`}
                  value={contactForm.phone}
                  onChange={(event) =>
                    setContactForm((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="flex justify-end gap-2 sm:col-span-2">
                {contactForm.contactId && (
                  <Button
                    variant="ghost"
                    onClick={() => setContactForm(EMPTY_CONTACT)}
                  >
                    Cancelar edição
                  </Button>
                )}
                <Button
                  onClick={saveContact}
                  disabled={saving || !contactForm.name.trim()}
                >
                  <Plus className="mr-1.5 size-4" />
                  {contactForm.contactId
                    ? "Salvar contato"
                    : "Adicionar contato"}
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
