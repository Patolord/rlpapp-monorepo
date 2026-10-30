import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
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
import { formatTaxId } from "@/lib/format-tax-id";

import {
  type SupplierForm,
  SupplierFields,
  parseLeadTimeDays,
  splitCategories,
} from "./supplier-fields";

export type SupplierSummary = FunctionReturnType<typeof api.suppliers.list>[number];

type ContactForm = {
  name: string;
  role: string;
  email: string;
  whatsapp: string;
};

const EMPTY_CONTACT: ContactForm = { name: "", role: "", email: "", whatsapp: "" };

export function supplierToForm(supplier: SupplierSummary): SupplierForm {
  return {
    name: supplier.name,
    personType: supplier.personType ?? "",
    legalName: supplier.legalName ?? "",
    taxId: formatTaxId(supplier.taxId) ?? "",
    stateRegistration: supplier.stateRegistration ?? "",
    email: supplier.email ?? "",
    phone: supplier.phone ?? "",
    website: supplier.website ?? "",
    address: supplier.address ?? "",
    paymentTerms: supplier.paymentTerms ?? "",
    defaultLeadTimeDays:
      supplier.defaultLeadTimeDays === null
        ? ""
        : String(supplier.defaultLeadTimeDays),
    categories: supplier.categories?.join(", ") ?? "",
    notes: supplier.notes ?? "",
  };
}

/** Diálogo "Gerenciar": edita o cadastro do fornecedor e seus contatos. */
export function SupplierDetailDialog({ supplier }: { supplier: SupplierSummary }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SupplierForm>(() => supplierToForm(supplier));
  const [contactForm, setContactForm] = useState<ContactForm>(EMPTY_CONTACT);
  const [saving, setSaving] = useState(false);
  const idPrefix = `supplier-${supplier._id}`;

  const details = useQuery(
    api.suppliers.get,
    open ? { supplierId: supplier._id } : "skip"
  );
  const updateSupplier = useMutation(api.suppliers.update);
  const addContact = useMutation(api.suppliers.addContact);
  const removeContact = useMutation(api.suppliers.removeContact);

  function reset(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setForm(supplierToForm(supplier));
      setContactForm(EMPTY_CONTACT);
    }
  }

  async function saveSupplier() {
    if (!form.name.trim()) {
      toast.error("Informe o nome");
      return;
    }
    setSaving(true);
    try {
      await updateSupplier({
        supplierId: supplier._id,
        name: form.name,
        personType: form.personType || null,
        legalName: form.legalName,
        taxId: form.taxId.trim() || null,
        stateRegistration: form.stateRegistration,
        email: form.email,
        phone: form.phone,
        website: form.website,
        address: form.address,
        paymentTerms: form.paymentTerms,
        defaultLeadTimeDays: parseLeadTimeDays(form.defaultLeadTimeDays),
        categories: splitCategories(form.categories),
        notes: form.notes,
      });
      toast.success("Fornecedor atualizado");
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao atualizar fornecedor"));
    } finally {
      setSaving(false);
    }
  }

  async function saveContact() {
    if (!contactForm.name.trim()) return;
    setSaving(true);
    try {
      await addContact({
        supplierId: supplier._id,
        name: contactForm.name,
        role: contactForm.role || undefined,
        email: contactForm.email || undefined,
        whatsapp: contactForm.whatsapp || undefined,
      });
      toast.success("Contato adicionado");
      setContactForm(EMPTY_CONTACT);
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao adicionar contato"));
    } finally {
      setSaving(false);
    }
  }

  async function deleteContact(contactId: Id<"supplierContacts">) {
    try {
      await removeContact({ contactId });
      toast.success("Contato removido");
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao remover contato"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Pencil className="mr-1.5 size-3.5" />
            Gerenciar
          </Button>
        }
      />
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {supplier.name}
            {!supplier.active && <Badge variant="secondary">Inativo</Badge>}
          </DialogTitle>
          <DialogDescription>
            Dados cadastrais, condições comerciais e contatos do fornecedor.
          </DialogDescription>
        </DialogHeader>

        <SupplierFields idPrefix={idPrefix} form={form} onChange={setForm} />

        <div className="flex justify-end">
          <Button onClick={saveSupplier} disabled={saving || !form.name.trim()}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Salvar dados
          </Button>
        </div>

        <div className="space-y-3 border-t pt-5">
          <div>
            <h3 className="font-semibold">Pessoas de contato</h3>
            <p className="text-sm text-muted-foreground">
              Vendedores, orçamentistas e demais contatos deste fornecedor.
            </p>
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
                    <span className="font-medium">{contact.name}</span>
                    <p className="text-sm text-muted-foreground">
                      {[contact.role, contact.whatsapp, contact.email]
                        .filter(Boolean)
                        .join(" · ") || "Sem detalhes"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteContact(contact._id)}
                  >
                    <Trash2 className="mr-1.5 size-3.5" />
                    Remover
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              Nenhum contato cadastrado.
            </p>
          )}

          <div className="grid gap-2 rounded-md bg-muted/40 p-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-contact-name`}>Nome</Label>
              <Input
                id={`${idPrefix}-contact-name`}
                value={contactForm.name}
                onChange={(e) =>
                  setContactForm((c) => ({ ...c, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-contact-role`}>Cargo / função</Label>
              <Input
                id={`${idPrefix}-contact-role`}
                value={contactForm.role}
                placeholder="Vendedor, Orçamentista"
                onChange={(e) =>
                  setContactForm((c) => ({ ...c, role: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-contact-whatsapp`}>WhatsApp</Label>
              <Input
                id={`${idPrefix}-contact-whatsapp`}
                value={contactForm.whatsapp}
                inputMode="tel"
                placeholder="5511999999999"
                onChange={(e) =>
                  setContactForm((c) => ({ ...c, whatsapp: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-contact-email`}>E-mail</Label>
              <Input
                id={`${idPrefix}-contact-email`}
                type="email"
                value={contactForm.email}
                onChange={(e) =>
                  setContactForm((c) => ({ ...c, email: e.target.value }))
                }
              />
            </div>
            <div className="flex justify-end sm:col-span-2">
              <Button
                onClick={saveContact}
                disabled={saving || !contactForm.name.trim()}
              >
                <Plus className="mr-1.5 size-4" />
                Adicionar contato
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
