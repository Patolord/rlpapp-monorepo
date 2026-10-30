import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { AtSign, Briefcase, Building2, CalendarClock, FileText, Globe, MapPin, MessageCircle, Pencil, Phone, Plus, StickyNote, Tags, Trash2, Truck, User, Wallet } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { AppButton, ConfirmDialog, EmptyState, Field, IconButton, KeyValueList, LoadingState, Pill, SectionTitle, SegmentedField, Sheet, Surface, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { formatTaxId } from "@/lib/format";
import { colors, space, type } from "@/lib/theme";

type Supplier = FunctionReturnType<typeof api.suppliers.list>[number];
type Contact = NonNullable<FunctionReturnType<typeof api.suppliers.get>>["contacts"][number];
type PersonType = "pf" | "pj";
/** Escolha do formulário: PJ, PF ou "não informado" (mantém registros antigos sem tipo). */
type PersonChoice = PersonType | "none";

/** Criar / editar fornecedor. */
export function SupplierFormSheet({ open, onClose, supplier, onSaved }: { open: boolean; onClose: () => void; supplier?: Supplier | null; onSaved?: (id: Id<"suppliers">) => void }) {
  const toast = useToast();
  const create = useMutation(api.suppliers.create);
  const update = useMutation(api.suppliers.update);
  const [name, setName] = useState("");
  const [personType, setPersonType] = useState<PersonChoice>("pj");
  const [legalName, setLegalName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [stateRegistration, setStateRegistration] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [leadTime, setLeadTime] = useState("");
  const [categories, setCategories] = useState("");
  const [notes, setNotes] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [leadTimeError, setLeadTimeError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(supplier?.name ?? "");
    // Registro existente sem tipo continua "não informado" até o usuário escolher.
    setPersonType(supplier ? (supplier.personType ?? "none") : "pj");
    setLegalName(supplier?.legalName ?? "");
    setTaxId(formatTaxId(supplier?.taxId ?? null) ?? "");
    setStateRegistration(supplier?.stateRegistration ?? "");
    setEmail(supplier?.email ?? "");
    setPhone(supplier?.phone ?? "");
    setWebsite(supplier?.website ?? "");
    setAddress(supplier?.address ?? "");
    setPaymentTerms(supplier?.paymentTerms ?? "");
    setLeadTime(supplier?.defaultLeadTimeDays === null || supplier?.defaultLeadTimeDays === undefined ? "" : String(supplier.defaultLeadTimeDays));
    setCategories(supplier?.categories?.join(", ") ?? "");
    setNotes(supplier?.notes ?? "");
    setNameError(undefined);
    setLeadTimeError(undefined);
  }, [open, supplier]);

  async function submit() {
    if (!name.trim()) {
      setNameError("Informe o nome");
      return;
    }
    let defaultLeadTimeDays: number | null = null;
    if (leadTime.trim()) {
      const parsed = Number(leadTime.trim());
      if (!Number.isInteger(parsed) || parsed < 0) {
        setLeadTimeError("Informe um número inteiro de dias");
        return;
      }
      defaultLeadTimeDays = parsed;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        legalName: personType === "pf" ? "" : legalName.trim(),
        stateRegistration: personType === "pf" ? "" : stateRegistration.trim(),
        email: email.trim(),
        phone: phone.trim(),
        website: website.trim(),
        address: address.trim(),
        paymentTerms: paymentTerms.trim(),
        categories: categories.split(/[,;]/).map((c) => c.trim()).filter(Boolean),
        notes: notes.trim(),
      };
      let id: Id<"suppliers">;
      if (supplier) {
        await update({ supplierId: supplier._id, ...payload, personType: personType === "none" ? null : personType, taxId: taxId.trim() || null, defaultLeadTimeDays });
        id = supplier._id;
        toast.success("Fornecedor atualizado");
      } else {
        id = await create({ ...payload, personType: personType === "none" ? undefined : personType, taxId: taxId.trim() || undefined, defaultLeadTimeDays: defaultLeadTimeDays ?? undefined });
        toast.success("Fornecedor criado");
      }
      onClose();
      onSaved?.(id);
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível salvar o fornecedor"));
    } finally {
      setSaving(false);
    }
  }

  const iconColor = colors.icon;
  const isPj = personType === "pj";
  const isPf = personType === "pf";
  const taxLabel = isPj ? "CNPJ" : isPf ? "CPF" : "CNPJ/CPF";

  return (
    <Sheet open={open} onClose={onClose} title={supplier ? "Editar fornecedor" : "Novo fornecedor"} maxHeight={0.9} footer={<AppButton label={supplier ? "Salvar" : "Criar fornecedor"} onPress={() => void submit()} loading={saving} />}>
      <SegmentedField<PersonChoice>
        label="Tipo"
        value={personType}
        onChange={setPersonType}
        options={[
          { value: "pj", label: "Pessoa jurídica" },
          { value: "pf", label: "Pessoa física" },
          { value: "none", label: "Não informado" },
        ]}
      />
      <Field label={isPj ? "Nome fantasia *" : "Nome *"} icon={isPj ? <Building2 size={24} color={iconColor} strokeWidth={1.6} /> : <Truck size={24} color={iconColor} strokeWidth={1.6} />} value={name} onChangeText={(v) => { setName(v); setNameError(undefined); }} error={nameError} autoFocus={!supplier} autoCapitalize="words" />
      {!isPf ? (
        <Field label="Razão social" icon={<FileText size={24} color={iconColor} strokeWidth={1.6} />} value={legalName} onChangeText={setLegalName} autoCapitalize="words" />
      ) : null}
      <Field label={taxLabel} icon={<FileText size={24} color={iconColor} strokeWidth={1.6} />} value={taxId} onChangeText={setTaxId} keyboardType="numbers-and-punctuation" placeholder={isPf ? "000.000.000-00" : "00.000.000/0000-00"} />
      {!isPf ? (
        <Field label="Inscrição estadual" icon={<FileText size={24} color={iconColor} strokeWidth={1.6} />} value={stateRegistration} onChangeText={setStateRegistration} keyboardType="numbers-and-punctuation" />
      ) : null}
      <Field label="Telefone" icon={<Phone size={24} color={iconColor} strokeWidth={1.6} />} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="(11) 4000-0000" />
      <Field label="E-mail" icon={<AtSign size={24} color={iconColor} strokeWidth={1.6} />} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholder="vendas@fornecedor.com.br" />
      <Field label="Site" icon={<Globe size={24} color={iconColor} strokeWidth={1.6} />} value={website} onChangeText={setWebsite} keyboardType="url" autoCapitalize="none" autoCorrect={false} placeholder="fornecedor.com.br" />
      <Field label="Endereço" icon={<MapPin size={24} color={iconColor} strokeWidth={1.6} />} value={address} onChangeText={setAddress} placeholder="Rua, número, cidade/UF" />
      <Field label="Condições de pagamento" icon={<Wallet size={24} color={iconColor} strokeWidth={1.6} />} value={paymentTerms} onChangeText={setPaymentTerms} placeholder="28 DDL, 30/60, à vista" />
      <Field label="Prazo de entrega padrão (dias)" icon={<CalendarClock size={24} color={iconColor} strokeWidth={1.6} />} value={leadTime} onChangeText={(v) => { setLeadTime(v); setLeadTimeError(undefined); }} error={leadTimeError} keyboardType="number-pad" />
      <Field label="Categorias" icon={<Tags size={24} color={iconColor} strokeWidth={1.6} />} value={categories} onChangeText={setCategories} placeholder="Dutos, Cobre, Elétrica" helper="Separe por vírgula." />
      <Field label="Observações" icon={<StickyNote size={24} color={iconColor} strokeWidth={1.6} />} value={notes} onChangeText={setNotes} multiline />
    </Sheet>
  );
}

function LinkText({ value, href }: { value: string; href: string }) {
  return (
    <Pressable onPress={() => void Linking.openURL(href).catch(() => undefined)} hitSlop={6}>
      <Text style={[type.body, { color: colors.primary }]}>{value}</Text>
    </Pressable>
  );
}

function leadTimeLabel(days: number): string {
  return days === 1 ? "1 dia" : `${days} dias`;
}

/** Detalhe do fornecedor com contatos. */
export function SupplierDetailSheet({ supplierId, onClose }: { supplierId: Id<"suppliers"> | null; onClose: () => void }) {
  const toast = useToast();
  const detail = useQuery(api.suppliers.get, supplierId ? { supplierId } : "skip");
  const update = useMutation(api.suppliers.update);
  const addContact = useMutation(api.suppliers.addContact);
  const removeContact = useMutation(api.suppliers.removeContact);
  const [editing, setEditing] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [removing, setRemoving] = useState<Contact | null>(null);
  const [busy, setBusy] = useState(false);

  const [cName, setCName] = useState("");
  const [cRole, setCRole] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cWhats, setCWhats] = useState("");

  const supplier = detail?.supplier ?? null;

  async function toggleActive() {
    if (!supplier) return;
    setBusy(true);
    try {
      await update({ supplierId: supplier._id, active: !supplier.active });
      toast.success(supplier.active ? "Fornecedor inativado" : "Fornecedor reativado");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível alterar"));
    } finally {
      setBusy(false);
    }
  }

  async function submitContact() {
    if (!supplier || !cName.trim()) return;
    setBusy(true);
    try {
      await addContact({ supplierId: supplier._id, name: cName.trim(), role: cRole.trim() || undefined, email: cEmail.trim() || undefined, whatsapp: cWhats.trim() || undefined });
      toast.success("Contato adicionado");
      setContactOpen(false);
      setCName(""); setCRole(""); setCEmail(""); setCWhats("");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível adicionar o contato"));
    } finally {
      setBusy(false);
    }
  }

  async function doRemoveContact() {
    if (!removing) return;
    setBusy(true);
    try {
      await removeContact({ contactId: removing._id });
      toast.success("Contato removido");
      setRemoving(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível remover"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Sheet
        open={supplierId !== null}
        onClose={onClose}
        title={supplier?.name ?? "Fornecedor"}
        subtitle={supplier?.categories?.join(" · ") || undefined}
        footer={
          supplier ? (
            <View style={styles.footer}>
              <AppButton label="Editar" variant="secondary" icon={<Pencil size={20} color={colors.text} strokeWidth={2} />} onPress={() => setEditing(true)} style={{ flex: 1 }} />
              <AppButton label={supplier.active ? "Inativar" : "Reativar"} variant="secondary" loading={busy && !contactOpen} onPress={() => void toggleActive()} style={{ flex: 1 }} />
            </View>
          ) : undefined
        }
      >
        {detail === undefined ? (
          <LoadingState style={{ flex: 0, paddingVertical: space.xxl }} />
        ) : detail === null || !supplier ? (
          <EmptyState title="Fornecedor não encontrado" />
        ) : (
          <>
            {!supplier.active ? <Pill label="Inativo" tone="warning" /> : null}
            <KeyValueList
              items={[
                { label: "Razão social", value: supplier.legalName },
                { label: supplier.personType === "pf" ? "CPF" : "CNPJ", value: formatTaxId(supplier.taxId) },
                { label: "Inscrição estadual", value: supplier.stateRegistration },
                {
                  label: "Telefone",
                  value: supplier.phone ? <LinkText value={supplier.phone} href={`tel:${supplier.phone.replace(/[^\d+]/g, "")}`} /> : null,
                },
                {
                  label: "E-mail",
                  value: supplier.email ? <LinkText value={supplier.email} href={`mailto:${supplier.email}`} /> : null,
                },
                {
                  label: "Site",
                  value: supplier.website ? <LinkText value={supplier.website.replace(/^https?:\/\//, "")} href={supplier.website} /> : null,
                },
                { label: "Endereço", value: supplier.address },
                { label: "Condições de pagamento", value: supplier.paymentTerms },
                { label: "Prazo de entrega padrão", value: supplier.defaultLeadTimeDays === null ? null : leadTimeLabel(supplier.defaultLeadTimeDays) },
                { label: "Observações", value: supplier.notes },
              ]}
            />
            <View>
              <SectionTitle title="Contatos" style={{ paddingHorizontal: 4, paddingTop: 0 }} action="Adicionar" onAction={() => setContactOpen(true)} />
              {detail.contacts.length === 0 ? (
                <Surface style={{ alignItems: "center", paddingVertical: space.xl, gap: space.sm }}>
                  <Text style={[type.bodySm, { color: colors.textSecondary }]}>Nenhum contato cadastrado.</Text>
                  <AppButton label="Adicionar contato" variant="ghost" size="sm" icon={<Plus size={18} color={colors.primary} strokeWidth={2} />} onPress={() => setContactOpen(true)} />
                </Surface>
              ) : (
                <View style={{ gap: space.sm }}>
                  {detail.contacts.map((contact) => (
                    <Surface key={contact._id} style={styles.contact} padded={false}>
                      <View style={styles.contactIcon}>
                        <User size={20} color={colors.primary} strokeWidth={1.8} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                          {contact.name}
                          {contact.role ? <Text style={[type.bodySm, { color: colors.textSecondary }]}> · {contact.role}</Text> : null}
                        </Text>
                        <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
                          {[contact.whatsapp, contact.email].filter(Boolean).join(" · ")}
                        </Text>
                      </View>
                      {contact.whatsapp ? (
                        <IconButton label="WhatsApp" tone="ghost" size={36} icon={<MessageCircle size={18} color={colors.success} strokeWidth={2} />} onPress={() => void Linking.openURL(`https://wa.me/${contact.whatsapp!.replace(/\D/g, "")}`).catch(() => undefined)} />
                      ) : null}
                      {contact.email ? (
                        <IconButton label="E-mail" tone="ghost" size={36} icon={<AtSign size={18} color={colors.primary} strokeWidth={2} />} onPress={() => void Linking.openURL(`mailto:${contact.email}`).catch(() => undefined)} />
                      ) : null}
                      <IconButton label="Remover contato" tone="ghost" size={36} icon={<Trash2 size={18} color={colors.danger} strokeWidth={2} />} onPress={() => setRemoving(contact)} />
                    </Surface>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </Sheet>

      {supplier ? <SupplierFormSheet open={editing} onClose={() => setEditing(false)} supplier={supplier} /> : null}

      <Sheet open={contactOpen} onClose={() => setContactOpen(false)} title="Novo contato" subtitle={supplier?.name} maxHeight={0.8} footer={<AppButton label="Adicionar" disabled={!cName.trim()} loading={busy} onPress={() => void submitContact()} />}>
        <Field label="Nome *" icon={<User size={24} color={colors.icon} strokeWidth={1.6} />} value={cName} onChangeText={setCName} autoFocus />
        <Field label="Cargo / função" icon={<Briefcase size={24} color={colors.icon} strokeWidth={1.6} />} value={cRole} onChangeText={setCRole} placeholder="Vendedor, Orçamentista" />
        <Field label="WhatsApp" icon={<MessageCircle size={24} color={colors.icon} strokeWidth={1.6} />} value={cWhats} onChangeText={setCWhats} keyboardType="phone-pad" placeholder="+55 11 9…" />
        <Field label="E-mail" icon={<AtSign size={24} color={colors.icon} strokeWidth={1.6} />} value={cEmail} onChangeText={setCEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
      </Sheet>

      <ConfirmDialog open={removing !== null} title="Remover contato?" description={removing?.name} confirmLabel="Remover" destructive busy={busy} onCancel={() => setRemoving(null)} onConfirm={() => void doRemoveContact()} />
    </>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: "row", gap: space.md },
  contact: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingLeft: space.md, paddingRight: 6, paddingVertical: 10 },
  contactIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
});
