import { useState } from "react";
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
import { getErrorMessage } from "@/lib/errors";

import {
  type PartyForm,
  type PartySummary,
  PartyInfoFields,
  type PersonType,
  partyToForm,
} from "./party-info-fields";

/**
 * Clientes e empreiteiros têm o mesmo modelo (pessoa + contatos). Cada tipo
 * entrega um `PartyConfig` com os textos, o botão de abertura e um hook que
 * liga o diálogo às funções Convex dele (api.customers.* / api.contractors.*).
 */
export type PartyKind = "customer" | "contractor";

export type PartyContact<ContactId extends string> = {
  _id: ContactId;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  active: boolean;
};

export type PartyApi<ContactId extends string> = {
  /** `undefined` enquanto carrega ou com o diálogo fechado. */
  details: { contacts: PartyContact<ContactId>[] } | null | undefined;
  update: (fields: {
    name: string;
    personType: PersonType | null;
    legalName: string;
    taxId: string | null;
    email: string;
    phone: string;
    address: string;
    notes: string;
  }) => Promise<unknown>;
  addContact: (fields: {
    name: string;
    email: string | undefined;
    phone: string | undefined;
    role: string | undefined;
  }) => Promise<unknown>;
  updateContact: (args: {
    contactId: ContactId;
    name: string;
    email: string | null;
    phone: string | null;
    role: string | null;
  }) => Promise<unknown>;
  removeContact: (args: { contactId: ContactId }) => Promise<unknown>;
  restoreContact: (args: { contactId: ContactId }) => Promise<unknown>;
};

export type PartyConfig<PartyId extends string, ContactId extends string> = {
  kind: PartyKind;
  /** "icon": botão só com ícone; "text": botão com ícone e "Gerenciar". */
  trigger: "icon" | "text";
  labels: {
    description: string;
    updated: string;
    updateError: string;
  };
  usePartyApi: (
    partyId: PartyId,
    query: { open: boolean; includeInactiveContacts: boolean }
  ) => PartyApi<ContactId>;
};

type ContactForm<ContactId extends string> = {
  contactId: ContactId | null;
  name: string;
  email: string;
  phone: string;
  role: string;
};

const EMPTY_CONTACT: ContactForm<never> = {
  contactId: null,
  name: "",
  email: "",
  phone: "",
  role: "",
};

export function PartyDetailDialog<
  PartyId extends string,
  ContactId extends string,
>({
  party,
  config,
}: {
  party: PartySummary<PartyId>;
  config: PartyConfig<PartyId, ContactId>;
}) {
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [form, setForm] = useState<PartyForm>(() => partyToForm(party));
  const [contactForm, setContactForm] =
    useState<ContactForm<ContactId>>(EMPTY_CONTACT);
  const [saving, setSaving] = useState(false);
  const isArchived = party.archivedAt !== null;
  const idPrefix = `${config.kind}-${party._id}`;

  const {
    details,
    update: updateParty,
    addContact,
    updateContact,
    removeContact: archiveContact,
    restoreContact,
  } = config.usePartyApi(party._id, {
    open,
    includeInactiveContacts: showHistory,
  });

  function reset(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setForm(partyToForm(party));
      setContactForm(EMPTY_CONTACT);
      setShowHistory(false);
    }
  }

  async function saveParty() {
    if (isArchived || !form.name.trim()) return;
    setSaving(true);
    try {
      await updateParty({
        name: form.name,
        personType: form.personType || null,
        legalName: form.legalName,
        taxId: form.taxId || null,
        email: form.email,
        phone: form.phone,
        address: form.address,
        notes: form.notes,
      });
      toast.success(config.labels.updated);
    } catch (error) {
      toast.error(getErrorMessage(error, config.labels.updateError));
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

  async function setContactActive(contactId: ContactId, active: boolean) {
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
        {config.trigger === "icon" ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Gerenciar"
            title="Gerenciar"
          >
            <Pencil />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Pencil />
            Gerenciar
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{party.name}</DialogTitle>
          <DialogDescription>{config.labels.description}</DialogDescription>
        </DialogHeader>

        <PartyInfoFields
          form={form}
          setForm={setForm}
          isArchived={isArchived}
          idPrefix={idPrefix}
        />

        {!isArchived && (
          <div className="flex justify-end">
            <Button onClick={saveParty} disabled={saving || !form.name.trim()}>
              {saving && <Loader2 className="animate-spin" />}
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
              <History />
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
                        <Pencil />
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
                          <Archive />
                        ) : (
                          <RotateCcw />
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
                  <Plus />
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
