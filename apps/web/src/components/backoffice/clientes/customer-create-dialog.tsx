import { api } from "@rlpapp/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { getErrorMessage } from "@/lib/errors";

export function CustomerCreateDialog() {
  const createCustomer = useMutation(api.customers.create);
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

  async function handleCreate() {
    if (!form.name.trim()) {
      toast.error("Informe o nome");
      return;
    }
    setSubmitting(true);
    try {
      await createCustomer({
        name: form.name,
        personType: form.personType || undefined,
        legalName: form.legalName || undefined,
        taxId: form.taxId || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
        notes: form.notes || undefined,
      });
      toast.success("Cliente criado");
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
      toast.error(getErrorMessage(error, "Erro ao criar cliente"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus />
        Novo cliente
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo cliente</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-2">
            <Label htmlFor="customer-name">Nome</Label>
            <Input
              id="customer-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer-legal">Razão social</Label>
            <Input
              id="customer-legal"
              value={form.legalName}
              onChange={(e) =>
                setForm({ ...form, legalName: e.target.value })
              }
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="customer-person-type">Tipo de pessoa</Label>
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
                <SelectTrigger id="customer-person-type">
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
              <Label htmlFor="customer-tax">
                {form.personType === "pf"
                  ? "CPF"
                  : form.personType === "pj"
                    ? "CNPJ"
                    : "CPF/CNPJ"}
              </Label>
              <Input
                id="customer-tax"
                value={form.taxId}
                onChange={(e) =>
                  setForm({ ...form, taxId: e.target.value })
                }
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="customer-phone">Telefone</Label>
              <Input
                id="customer-phone"
                value={form.phone}
                onChange={(e) =>
                  setForm({ ...form, phone: e.target.value })
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer-email">E-mail</Label>
            <Input
              id="customer-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer-address">Endereço</Label>
            <Input
              id="customer-address"
              value={form.address}
              onChange={(e) =>
                setForm({ ...form, address: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer-notes">Observações</Label>
            <Input
              id="customer-notes"
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
  );
}
