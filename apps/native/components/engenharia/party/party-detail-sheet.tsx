import { useMutation, useQuery } from "convex/react";
import { Archive, ArchiveRestore, AtSign, Pencil, Phone, Plus, RotateCcw, Trash2, User } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import {
  AppButton,
  ConfirmDialog,
  EmptyState,
  IconButton,
  KeyValueList,
  LoadingState,
  Pill,
  SectionTitle,
  Sheet,
  Surface,
  useToast,
} from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { formatTaxId } from "@/lib/format";
import { colors, space, type } from "@/lib/theme";

import { PERSON_TYPE_LABELS, type PartyAdapter, type PartyContact, type PartyRow } from "./adapter";
import { ContactFormSheet } from "./contact-form-sheet";
import { PartyFormSheet } from "./party-form-sheet";

/** Detalhe de cliente/empreiteiro: dados, contatos e ações. */
export function PartyDetailSheet({
  adapter,
  partyId,
  onClose,
}: {
  adapter: PartyAdapter;
  partyId: string | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const detail = useQuery(adapter.get, partyId ? { [adapter.idKey]: partyId, includeInactiveContacts: true } : "skip") as
    | { contacts: PartyContact[] }
    | null
    | undefined;
  const party = detail ? adapter.pick(detail as unknown as Record<string, unknown>) : null;

  const archive = useMutation(adapter.archive);
  const restore = useMutation(adapter.restore);
  const removeContact = useMutation(adapter.removeContact);
  const restoreContact = useMutation(adapter.restoreContact);

  const [editing, setEditing] = useState(false);
  const [contactForm, setContactForm] = useState<{ open: boolean; contact: PartyContact | null }>({ open: false, contact: null });
  const [confirm, setConfirm] = useState<{ kind: "archive" | "removeContact"; contact?: PartyContact } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, success: string, fallback: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      setConfirm(null);
    } catch (error) {
      toast.error(getErrorMessage(error, fallback));
    } finally {
      setBusy(false);
    }
  }

  const activeContacts = detail?.contacts.filter((c) => c.active && !c.archivedAt) ?? [];
  const inactiveContacts = detail?.contacts.filter((c) => !c.active || c.archivedAt) ?? [];

  return (
    <>
      <Sheet
        open={partyId !== null}
        onClose={onClose}
        title={party?.name ?? adapter.singular}
        subtitle={party ? (party.personType ? PERSON_TYPE_LABELS[party.personType] : undefined) : undefined}
        footer={
          party ? (
            <View style={styles.footer}>
              <AppButton
                label="Editar"
                variant="secondary"
                icon={<Pencil size={20} color={colors.text} strokeWidth={2} />}
                onPress={() => setEditing(true)}
                style={{ flex: 1 }}
              />
              {party.archivedAt ? (
                <AppButton
                  label="Restaurar"
                  icon={<ArchiveRestore size={20} color={colors.onPrimary} strokeWidth={2} />}
                  trailing={null}
                  loading={busy}
                  onPress={() =>
                    void run(
                      () => restore({ [adapter.idKey]: party._id }),
                      `${adapter.singular} restaurado`,
                      "Não foi possível restaurar"
                    )
                  }
                  style={{ flex: 1 }}
                />
              ) : (
                <AppButton
                  label="Arquivar"
                  variant="secondary"
                  icon={<Archive size={20} color={colors.danger} strokeWidth={2} />}
                  onPress={() => setConfirm({ kind: "archive" })}
                  style={{ flex: 1 }}
                />
              )}
            </View>
          ) : undefined
        }
      >
        {detail === undefined ? (
          <LoadingState style={{ flex: 0, paddingVertical: space.xxl }} />
        ) : detail === null || !party ? (
          <EmptyState title={`${adapter.singular} não encontrado`} />
        ) : (
          <>
            <View style={styles.pills}>
              {party.archivedAt ? <Pill label="Arquivado" tone="neutral" /> : null}
              {!party.active && !party.archivedAt ? <Pill label="Inativo" tone="warning" /> : null}
            </View>

            <KeyValueList
              items={[
                { label: "Razão social", value: party.legalName },
                { label: party.personType === "pf" ? "CPF" : "CNPJ", value: formatTaxId(party.taxId) },
                {
                  label: "E-mail",
                  value: party.email ? <LinkText value={party.email} href={`mailto:${party.email}`} /> : null,
                },
                {
                  label: "Telefone",
                  value: party.phone ? <LinkText value={party.phone} href={`tel:${party.phone.replace(/\D/g, "")}`} /> : null,
                },
                { label: "Endereço", value: party.address },
                { label: "Observações", value: party.notes },
              ]}
            />

            <View>
              <SectionTitle
                title="Contatos"
                style={{ paddingHorizontal: 4, paddingTop: 0 }}
                action="Adicionar"
                onAction={() => setContactForm({ open: true, contact: null })}
              />
              {activeContacts.length === 0 ? (
                <Surface style={{ alignItems: "center", gap: space.sm, paddingVertical: space.xl }}>
                  <Text style={[type.bodySm, { color: colors.textSecondary }]}>Nenhum contato cadastrado.</Text>
                  <AppButton
                    label="Adicionar contato"
                    variant="ghost"
                    size="sm"
                    icon={<Plus size={18} color={colors.primary} strokeWidth={2} />}
                    onPress={() => setContactForm({ open: true, contact: null })}
                  />
                </Surface>
              ) : (
                <View style={{ gap: space.sm }}>
                  {activeContacts.map((contact) => (
                    <ContactRow
                      key={contact._id}
                      contact={contact}
                      onEdit={() => setContactForm({ open: true, contact })}
                      onRemove={() => setConfirm({ kind: "removeContact", contact })}
                    />
                  ))}
                </View>
              )}
              {inactiveContacts.length > 0 ? (
                <View style={{ gap: space.sm, marginTop: space.md }}>
                  <Text style={[type.caption, { color: colors.textMuted, marginLeft: 4 }]}>Removidos</Text>
                  {inactiveContacts.map((contact) => (
                    <ContactRow
                      key={contact._id}
                      contact={contact}
                      inactive
                      onRestore={() =>
                        void run(
                          () => restoreContact({ contactId: contact._id }),
                          "Contato restaurado",
                          "Não foi possível restaurar o contato"
                        )
                      }
                    />
                  ))}
                </View>
              ) : null}
            </View>
          </>
        )}
      </Sheet>

      {party ? (
        <>
          <PartyFormSheet adapter={adapter} open={editing} onClose={() => setEditing(false)} party={party} />
          <ContactFormSheet
            adapter={adapter}
            partyId={party._id}
            open={contactForm.open}
            contact={contactForm.contact}
            onClose={() => setContactForm({ open: false, contact: null })}
          />
        </>
      ) : null}

      <ConfirmDialog
        open={confirm?.kind === "archive"}
        title={`Arquivar ${adapter.singular.toLowerCase()}?`}
        description={`${party?.name ?? ""} sai das listas, mas o histórico é mantido. Você pode restaurar depois.`}
        confirmLabel="Arquivar"
        destructive
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          party &&
          void run(
            () => archive({ [adapter.idKey]: party._id }),
            `${adapter.singular} arquivado`,
            "Não foi possível arquivar"
          )
        }
      />
      <ConfirmDialog
        open={confirm?.kind === "removeContact"}
        title="Remover contato?"
        description={confirm?.contact ? `${confirm.contact.name} deixa de aparecer nos contatos. Pode ser restaurado depois.` : undefined}
        confirmLabel="Remover"
        destructive
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          confirm?.contact &&
          void run(
            () => removeContact({ contactId: confirm.contact!._id }),
            "Contato removido",
            "Não foi possível remover o contato"
          )
        }
      />
    </>
  );
}

function LinkText({ value, href }: { value: string; href: string }) {
  return (
    <Pressable onPress={() => void Linking.openURL(href).catch(() => undefined)} hitSlop={6}>
      <Text style={[type.body, { color: colors.primary }]}>{value}</Text>
    </Pressable>
  );
}

function ContactRow({
  contact,
  inactive,
  onEdit,
  onRemove,
  onRestore,
}: {
  contact: PartyContact;
  inactive?: boolean;
  onEdit?: () => void;
  onRemove?: () => void;
  onRestore?: () => void;
}) {
  const details = [contact.email, contact.phone].filter(Boolean).join(" · ");
  return (
    <Surface style={[styles.contact, inactive && { opacity: 0.7 }]} padded={false}>
      <View style={styles.contactIcon}>
        <User size={20} color={colors.primary} strokeWidth={1.8} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
          {contact.name}
          {contact.role ? <Text style={[type.bodySm, { color: colors.textSecondary }]}> · {contact.role}</Text> : null}
        </Text>
        {details ? (
          <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={2}>
            {details}
          </Text>
        ) : null}
      </View>
      <View style={styles.contactActions}>
        {contact.phone && !inactive ? (
          <IconButton
            label="Ligar"
            size={36}
            tone="ghost"
            icon={<Phone size={18} color={colors.primary} strokeWidth={2} />}
            onPress={() => void Linking.openURL(`tel:${contact.phone!.replace(/\D/g, "")}`).catch(() => undefined)}
          />
        ) : null}
        {contact.email && !inactive ? (
          <IconButton
            label="E-mail"
            size={36}
            tone="ghost"
            icon={<AtSign size={18} color={colors.primary} strokeWidth={2} />}
            onPress={() => void Linking.openURL(`mailto:${contact.email}`).catch(() => undefined)}
          />
        ) : null}
        {onEdit ? (
          <IconButton label="Editar contato" size={36} tone="ghost" icon={<Pencil size={18} color={colors.text} strokeWidth={2} />} onPress={onEdit} />
        ) : null}
        {onRemove ? (
          <IconButton label="Remover contato" size={36} tone="ghost" icon={<Trash2 size={18} color={colors.danger} strokeWidth={2} />} onPress={onRemove} />
        ) : null}
        {onRestore ? (
          <IconButton label="Restaurar contato" size={36} tone="ghost" icon={<RotateCcw size={18} color={colors.primary} strokeWidth={2} />} onPress={onRestore} />
        ) : null}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: "row", gap: space.md },
  pills: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  contact: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingLeft: space.md,
    paddingRight: 6,
    paddingVertical: 10,
  },
  contactIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  contactActions: { flexDirection: "row", alignItems: "center" },
});
