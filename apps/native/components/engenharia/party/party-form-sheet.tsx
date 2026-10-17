import { useMutation } from "convex/react";
import { AtSign, Building2, FileText, MapPin, Phone, StickyNote, User } from "lucide-react-native";
import { useEffect, useState } from "react";

import { AppButton, Field, SegmentedField, Sheet, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { colors } from "@/lib/theme";

import type { PartyAdapter, PartyRow } from "./adapter";

type PersonType = "pf" | "pj";

/** Criar / editar cliente ou empreiteiro. */
export function PartyFormSheet({
  adapter,
  open,
  onClose,
  party,
  onSaved,
}: {
  adapter: PartyAdapter;
  open: boolean;
  onClose: () => void;
  /** Quando presente, edita; senão cria. */
  party?: PartyRow | null;
  onSaved?: (id: string) => void;
}) {
  const toast = useToast();
  const create = useMutation(adapter.create);
  const update = useMutation(adapter.update);
  const isEdit = Boolean(party);

  const [name, setName] = useState("");
  const [personType, setPersonType] = useState<PersonType>("pj");
  const [legalName, setLegalName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(party?.name ?? "");
    setPersonType(party?.personType ?? "pj");
    setLegalName(party?.legalName ?? "");
    setTaxId(party?.taxId ?? "");
    setEmail(party?.email ?? "");
    setPhone(party?.phone ?? "");
    setAddress(party?.address ?? "");
    setNotes(party?.notes ?? "");
    setNameError(undefined);
  }, [open, party]);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Informe o nome");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: trimmed,
        personType,
        legalName: legalName.trim(),
        taxId: taxId.trim(),
        email: email.trim(),
        phone: phone.trim(),
        address: address.trim(),
        notes: notes.trim(),
      };
      let id: string;
      if (party) {
        await update({ [adapter.idKey]: party._id, ...payload });
        id = party._id;
        toast.success(`${adapter.singular} atualizado`);
      } else {
        id = (await create(payload)) as string;
        toast.success(`${adapter.singular} criado`);
      }
      onClose();
      onSaved?.(id);
    } catch (error) {
      toast.error(getErrorMessage(error, `Não foi possível salvar ${adapter.article} ${adapter.singular.toLowerCase()}`));
    } finally {
      setSaving(false);
    }
  }

  const iconColor = colors.icon;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEdit ? `Editar ${adapter.singular.toLowerCase()}` : `Novo ${adapter.singular.toLowerCase()}`}
      footer={<AppButton label={isEdit ? "Salvar alterações" : "Criar"} onPress={() => void submit()} loading={saving} />}
    >
      <SegmentedField<PersonType>
        label="Tipo"
        value={personType}
        onChange={setPersonType}
        options={[
          { value: "pj", label: "Pessoa jurídica" },
          { value: "pf", label: "Pessoa física" },
        ]}
      />
      <Field
        label={personType === "pj" ? "Nome fantasia *" : "Nome *"}
        icon={personType === "pj" ? <Building2 size={24} color={iconColor} strokeWidth={1.6} /> : <User size={24} color={iconColor} strokeWidth={1.6} />}
        value={name}
        onChangeText={(v) => {
          setName(v);
          if (nameError) setNameError(undefined);
        }}
        error={nameError}
        autoCapitalize="words"
        returnKeyType="next"
      />
      {personType === "pj" ? (
        <Field
          label="Razão social"
          icon={<FileText size={24} color={iconColor} strokeWidth={1.6} />}
          value={legalName}
          onChangeText={setLegalName}
          autoCapitalize="words"
        />
      ) : null}
      <Field
        label={personType === "pj" ? "CNPJ" : "CPF"}
        icon={<FileText size={24} color={iconColor} strokeWidth={1.6} />}
        value={taxId}
        onChangeText={setTaxId}
        keyboardType="numbers-and-punctuation"
        placeholder={personType === "pj" ? "00.000.000/0000-00" : "000.000.000-00"}
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
      <Field
        label="Endereço"
        icon={<MapPin size={24} color={iconColor} strokeWidth={1.6} />}
        value={address}
        onChangeText={setAddress}
      />
      <Field
        label="Observações"
        icon={<StickyNote size={24} color={iconColor} strokeWidth={1.6} />}
        value={notes}
        onChangeText={setNotes}
        multiline
      />
    </Sheet>
  );
}
