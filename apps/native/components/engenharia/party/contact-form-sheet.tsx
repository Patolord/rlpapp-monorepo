import { useMutation } from "convex/react";
import { AtSign, Briefcase, Phone, User } from "lucide-react-native";
import { useEffect, useState } from "react";

import { AppButton, Field, Sheet, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { colors } from "@/lib/theme";

import type { PartyAdapter, PartyContact } from "./adapter";

/** Adicionar / editar contato de cliente ou empreiteiro. */
export function ContactFormSheet({
  adapter,
  partyId,
  open,
  onClose,
  contact,
}: {
  adapter: PartyAdapter;
  partyId: string;
  open: boolean;
  onClose: () => void;
  contact?: PartyContact | null;
}) {
  const toast = useToast();
  const addContact = useMutation(adapter.addContact);
  const updateContact = useMutation(adapter.updateContact);
  const isEdit = Boolean(contact);

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(contact?.name ?? "");
    setRole(contact?.role ?? "");
    setEmail(contact?.email ?? "");
    setPhone(contact?.phone ?? "");
    setNameError(undefined);
  }, [open, contact]);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Informe o nome");
      return;
    }
    setSaving(true);
    try {
      if (contact) {
        await updateContact({
          contactId: contact._id,
          name: trimmed,
          role: role.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
        });
        toast.success("Contato atualizado");
      } else {
        await addContact({
          [adapter.idKey]: partyId,
          name: trimmed,
          role: role.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
        });
        toast.success("Contato adicionado");
      }
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível salvar o contato"));
    } finally {
      setSaving(false);
    }
  }

  const iconColor = colors.icon;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar contato" : "Novo contato"}
      maxHeight={0.8}
      footer={<AppButton label={isEdit ? "Salvar" : "Adicionar"} onPress={() => void submit()} loading={saving} />}
    >
      <Field
        label="Nome *"
        icon={<User size={24} color={iconColor} strokeWidth={1.6} />}
        value={name}
        onChangeText={(v) => {
          setName(v);
          if (nameError) setNameError(undefined);
        }}
        error={nameError}
        autoCapitalize="words"
        autoFocus
      />
      <Field
        label="Cargo / função"
        icon={<Briefcase size={24} color={iconColor} strokeWidth={1.6} />}
        value={role}
        onChangeText={setRole}
        placeholder="Engenheiro, Comprador..."
      />
      <Field
        label="E-mail"
        icon={<AtSign size={24} color={iconColor} strokeWidth={1.6} />}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Field
        label="Telefone"
        icon={<Phone size={24} color={iconColor} strokeWidth={1.6} />}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />
    </Sheet>
  );
}
