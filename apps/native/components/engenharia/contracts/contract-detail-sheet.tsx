import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatCurrency, formatDate } from "@rlpapp/shared";
import { useMutation, useQuery } from "convex/react";
import { Pencil, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  AppButton,
  ConfirmDialog,
  EmptyState,
  KeyValueList,
  LoadingState,
  Pill,
  SectionTitle,
  Sheet,
  Surface,
  useToast,
} from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { colors, space, type } from "@/lib/theme";

import { ContractFormSheet } from "./contract-form-sheet";
import { DIRECTION_LABELS, DIRECTION_TONE, KIND_LABELS } from "./labels";

/** Detalhe do contrato: contraparte, itens de serviço, editar e excluir. */
export function ContractDetailSheet({
  contractId,
  onClose,
}: {
  contractId: Id<"contracts"> | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const contract = useQuery(api.contracts.get, contractId ? { contractId } : "skip");
  const remove = useMutation(api.contracts.remove);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirmRemove() {
    if (!contract) return;
    setBusy(true);
    try {
      await remove({ contractId: contract._id });
      toast.success("Contrato excluído");
      setConfirming(false);
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível excluir o contrato"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Sheet
        open={contractId !== null}
        onClose={onClose}
        title={contract?.title ?? "Contrato"}
        subtitle={contract ? formatCurrency(contract.valueCents) : undefined}
        footer={
          contract ? (
            <View style={styles.footer}>
              <AppButton
                label="Editar"
                variant="secondary"
                icon={<Pencil size={20} color={colors.text} strokeWidth={2} />}
                onPress={() => setEditing(true)}
                style={{ flex: 1 }}
              />
              <AppButton
                label="Excluir"
                variant="secondary"
                icon={<Trash2 size={20} color={colors.danger} strokeWidth={2} />}
                onPress={() => setConfirming(true)}
                style={{ flex: 1 }}
              />
            </View>
          ) : undefined
        }
      >
        {contract === undefined ? (
          <LoadingState style={{ flex: 0, paddingVertical: space.xxl }} />
        ) : contract === null ? (
          <EmptyState title="Contrato não encontrado" />
        ) : (
          <>
            <View style={styles.pills}>
              <Pill label={DIRECTION_LABELS[contract.direction]} tone={DIRECTION_TONE[contract.direction]} />
              <Pill label={KIND_LABELS[contract.kind]} tone="neutral" />
            </View>
            <KeyValueList
              items={[
                { label: "Obra", value: contract.projectName },
                { label: "Contrato base", value: contract.parentTitle },
                { label: "Cliente", value: contract.customerName },
                { label: "Empreiteiro", value: contract.contractorName },
                { label: "Assinado em", value: contract.signedAt ? formatDate(contract.signedAt) : null },
                { label: "Observações", value: contract.notes },
                { label: "Criado em", value: formatDate(contract.createdAt) },
              ]}
            />
            <View>
              <SectionTitle title="Itens de serviço" style={{ paddingHorizontal: 4, paddingTop: 0 }} />
              {contract.serviceItems.length === 0 ? (
                <Text style={[type.bodySm, { color: colors.textSecondary, marginLeft: 4 }]}>Sem itens.</Text>
              ) : (
                <Surface padded={false}>
                  {contract.serviceItems.map((item, index) => (
                    <View key={item._id} style={[styles.item, index > 0 && styles.itemBorder]}>
                      <Text style={[type.body, { color: colors.text, flex: 1 }]}>{item.description}</Text>
                      <Text style={[type.bodyStrong, { color: colors.text }]}>{formatCurrency(item.valueCents)}</Text>
                    </View>
                  ))}
                  <View style={[styles.item, styles.itemBorder, { backgroundColor: colors.surfaceMuted }]}>
                    <Text style={[type.bodyStrong, { color: colors.textSecondary, flex: 1 }]}>Total</Text>
                    <Text style={[type.heading, { color: colors.text }]}>{formatCurrency(contract.valueCents)}</Text>
                  </View>
                </Surface>
              )}
            </View>
          </>
        )}
      </Sheet>

      {contract ? <ContractFormSheet open={editing} onClose={() => setEditing(false)} contract={contract} /> : null}

      <ConfirmDialog
        open={confirming}
        title="Excluir contrato?"
        description="Os itens de serviço são removidos junto. Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        destructive
        busy={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void confirmRemove()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: "row", gap: space.md },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: 12,
  },
  itemBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
});
