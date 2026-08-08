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

export type CustomerSummary = {
  _id: Id<"customers">;
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

type CustomerForm = {
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
  contactId: Id<"customerContacts"> | null;
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

function customerToForm(customer: CustomerSummary): CustomerForm {
  return {
    name: customer.name,
    personType: customer.personType ?? "",
    legalName: customer.legalName ?? "",
    taxId: customer.taxId ?? "",
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    address: customer.address ?? "",
    notes: customer.notes ?? "",
  };
}

export function CustomerDetailDialog({
  customer,
}: {
  customer: CustomerSummary;
}) {
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [form, setForm] = useState<CustomerForm>(() => customerToForm(customer));
  const [contactForm, setContactForm] =
    useState<ContactForm>(EMPTY_CONTACT);
  const [saving, setSaving] = useState(false);

  const details = useQuery(
    api.customers.get,
    open
      ? {
          customerId: customer._id,
          includeInactiveContacts: showHistory,
        }
      : "skip"
  );
  const updateCustomer = useMutation(api.customers.update);
  const addContact = useMutation(api.customers.addContact);
  const updateContact = useMutation(api.customers.updateContact);
  const archiveContact = useMutation(api.customers.removeContact);
  const restoreContact = useMutation(api.customers.restoreContact);

  function reset(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setForm(customerToForm(customer));
      setContactForm(EMPTY_CONTACT);
      setShowHistory(false);
    }
  }

  async function saveCustomer() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await updateCustomer({
        customerId: customer._id,
        name: form.name,
        personType: form.personType || null,
        legalName: form.legalName,
        taxId: form.taxId || null,
        email: form.email,
        phone: form.phone,
        address: form.address,
        notes: form.notes,
      });
      toast.success("Cliente atualizado");
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao atualizar cliente"));
    } finally {
      setSaving(false);
    }
  }

  async function saveContact() {
    if (!contactForm.name.trim()) return;
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
          customerId: customer._id,
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
    contactId: Id<"customerContacts">,
    active: boolean
  ) {
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
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Pencil className="mr-1.5 size-3.5" />
        Gerenciar
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{customer.name}</DialogTitle>
          <DialogDescription>
            Dados cadastrais e contatos atuais ou históricos do cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`customer-name-${customer._id}`}>Nome</Label>
            <Input
              id={`customer-name-${customer._id}`}
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Tipo de pessoa</Label>
            <Select
              value={form.personType || "__none__"}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  personType:
                    value === "__none__" ? "" : (value as PersonType),
                }))
              }
            >
              <SelectTrigger>
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
            <Label>Razão social</Label>
            <Input
              value={form.legalName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  legalName: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>
              {form.personType === "pf"
                ? "CPF"
                : form.personType === "pj"
                  ? "CNPJ"
                  : "CPF/CNPJ"}
            </Label>
            <Input
              value={form.taxId}
              onChange={(event) =>
                setForm((current) => ({ ...current, taxId: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>E-mail da empresa</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({ ...current, email: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Telefone da empresa</Label>
            <Input
              value={form.phone}
              onChange={(event) =>
                setForm((current) => ({ ...current, phone: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Endereço</Label>
            <Input
              value={form.address}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  address: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Observações</Label>
            <Input
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({ ...current, notes: event.target.value }))
              }
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={saveCustomer} disabled={saving || !form.name.trim()}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Salvar dados
          </Button>
        </div>

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
                    {contact.active && (
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
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              Nenhum contato {showHistory ? "registrado" : "ativo"}.
            </p>
          )}

          <div className="grid gap-2 rounded-md bg-muted/40 p-3 sm:grid-cols-2">
            <Input
              placeholder="Nome do contato"
              value={contactForm.name}
              onChange={(event) =>
                setContactForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
            <Input
              placeholder="Cargo / função"
              value={contactForm.role}
              onChange={(event) =>
                setContactForm((current) => ({
                  ...current,
                  role: event.target.value,
                }))
              }
            />
            <Input
              type="email"
              placeholder="E-mail"
              value={contactForm.email}
              onChange={(event) =>
                setContactForm((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
            />
            <Input
              placeholder="Telefone"
              value={contactForm.phone}
              onChange={(event) =>
                setContactForm((current) => ({
                  ...current,
                  phone: event.target.value,
                }))
              }
            />
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
                {contactForm.contactId ? "Salvar contato" : "Adicionar contato"}
              </Button>
            </div>
          </div>
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
