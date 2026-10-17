import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { AtSign, Briefcase, MessageCircle, Pencil, Plus, StickyNote, Tags, Trash2, Truck, User } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";

import { AppButton, ConfirmDialog, EmptyState, Field, IconButton, KeyValueList, LoadingState, Pill, SectionTitle, Sheet, Surface, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { colors, space, type } from "@/lib/theme";

type Supplier = FunctionReturnType<typeof api.suppliers.list>[number];
type Contact = NonNullable<FunctionReturnType<typeof api.suppliers.get>>["contacts"][number];

/** Criar / editar fornecedor. */
export function SupplierFormSheet({ open, onClose, supplier, onSaved }: { open: boolean; onClose: () => void; supplier?: Supplier | null; onSaved?: (id: Id<"suppliers">) => void }) {
  const toast = useToast();
  const create = useMutation(api.suppliers.create);
  const update = useMutation(api.suppliers.update);
  const [name, setName] = useState("");
  const [categories, setCategories] = useState("");
  const [notes, setNotes] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(supplier?.name ?? "");
    setCategories(supplier?.categories?.join(", ") ?? "");
    setNotes(supplier?.notes ?? "");
    setNameError(undefined);
  }, [open, supplier]);

  async function submit() {
    if (!name.trim()) {
      setNameError("Informe o nome");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        categories: categories.split(",").map((c) => c.trim()).filter(Boolean),
        notes: notes.trim(),
      };
      let id: Id<"suppliers">;
      if (supplier) {
        await update({ supplierId: supplier._id, ...payload });
        id = supplier._id;
        toast.success("Fornecedor atualizado");
      } else {
        id = await create(payload);
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

  return (
    <Sheet open={open} onClose={onClose} title={supplier ? "Editar fornecedor" : "Novo fornecedor"} maxHeight={0.8} footer={<AppButton label={supplier ? "Salvar" : "Criar fornecedor"} onPress={() => void submit()} loading={saving} />}>
      <Field label="Nome *" icon={<Truck size={24} color={colors.icon} strokeWidth={1.6} />} value={name} onChangeText={(v) => { setName(v); setNameError(undefined); }} error={nameError} autoFocus={!supplier} />
      <Field label="Categorias" icon={<Tags size={24} color={colors.icon} strokeWidth={1.6} />} value={categories} onChangeText={setCategories} placeholder="Dutos, Cobre, Elétrica" helper="Separe por vírgula." />
      <Field label="Observações" icon={<StickyNote size={24} color={colors.icon} strokeWidth={1.6} />} value={notes} onChangeText={setNotes} multiline />
    </Sheet>
  );
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
            <KeyValueList items={[{ label: "Observações", value: supplier.notes }]} />
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
