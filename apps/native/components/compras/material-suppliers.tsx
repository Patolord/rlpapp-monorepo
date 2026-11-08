import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { Plus, Star, Trash2 } from "lucide-react-native";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AppButton, ConfirmDialog, Field, IconButton, Pill, PickerField, SectionTitle, Sheet, Surface, Toggle, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { colors, space, type } from "@/lib/theme";

type Offering = FunctionReturnType<typeof api.suppliers.listMaterialOfferings>[number];

/** Fornecedores do material (ficha K3): vincular, preferido e desvincular. */
export function MaterialSuppliers({ materialId, readOnly }: { materialId: Id<"materials">; readOnly: boolean }) {
  const toast = useToast();
  const offerings = useQuery(api.suppliers.listMaterialOfferings, { materialId });
  const remove = useMutation(api.suppliers.removeMaterialOffering);
  const [form, setForm] = useState<{ open: boolean; offering: Offering | null }>({ open: false, offering: null });
  const [toRemove, setToRemove] = useState<Offering | null>(null);
  const [busy, setBusy] = useState(false);

  async function doRemove() {
    if (!toRemove) return;
    setBusy(true);
    try {
      await remove({ offeringId: toRemove._id });
      toast.success("Fornecedor desvinculado");
      setToRemove(null);
    } catch (err) {
      toast.error(getErrorMessage(err, "Não deu para desvincular"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: space.sm }}>
      <SectionTitle title="Fornecedores" action={readOnly ? undefined : "Vincular"} onAction={() => setForm({ open: true, offering: null })} style={{ paddingHorizontal: 4, paddingTop: 0 }} />
      {offerings === undefined ? null : offerings.length === 0 ? (
        <Surface>
          <Text style={[type.bodySm, { color: colors.textSecondary }]}>Nenhum fornecedor vinculado.</Text>
          {!readOnly ? <AppButton label="Vincular fornecedor" variant="ghost" size="sm" icon={<Plus size={16} color={colors.primary} />} onPress={() => setForm({ open: true, offering: null })} /> : null}
        </Surface>
      ) : (
        <Surface padded={false}>
          {offerings.map((o, index) => (
            <View key={o._id} style={[styles.row, index > 0 && styles.border]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                  {o.supplierName}
                </Text>
                <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                  {[o.supplierCode ? `Cód. ${o.supplierCode}` : null, o.purchaseUnit ? `Compra em ${o.purchaseUnit}${o.unitsPerPurchaseUnit ? ` (${o.unitsPerPurchaseUnit})` : ""}` : null, o.leadTimeDays != null ? `${o.leadTimeDays} dias` : null].filter(Boolean).join(" · ") || "Sem detalhes"}
                </Text>
              </View>
              {o.preferred ? <Pill label="Preferido" tone="success" icon={<Star size={11} color={colors.success} />} /> : null}
              {!readOnly ? (
                <>
                  <AppButton label="Editar" variant="ghost" size="sm" onPress={() => setForm({ open: true, offering: o })} />
                  <IconButton tone="ghost" size={36} label="Desvincular fornecedor" icon={<Trash2 size={16} color={colors.destructive} />} onPress={() => setToRemove(o)} />
                </>
              ) : null}
            </View>
          ))}
        </Surface>
      )}
      <OfferingSheet open={form.open} materialId={materialId} offering={form.offering} onClose={() => setForm({ open: false, offering: null })} />
      <ConfirmDialog
        open={toRemove !== null}
        title={`Desvincular ${toRemove?.supplierName ?? "o fornecedor"}?`}
        description="O histórico de preços continua; só o vínculo sai."
        confirmLabel="Desvincular"
        destructive
        busy={busy}
        onConfirm={() => void doRemove()}
        onCancel={() => setToRemove(null)}
      />
    </View>
  );
}

function OfferingSheet({ open, materialId, offering, onClose }: { open: boolean; materialId: Id<"materials">; offering: Offering | null; onClose: () => void }) {
  const toast = useToast();
  const suppliers = useQuery(api.suppliers.list, open && !offering ? {} : "skip");
  const upsert = useMutation(api.suppliers.upsertMaterialOffering);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [unit, setUnit] = useState("");
  const [perUnit, setPerUnit] = useState("");
  const [lead, setLead] = useState("");
  const [preferred, setPreferred] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSupplierId(offering?.supplierId ?? null);
    setCode(offering?.supplierCode ?? "");
    setUnit(offering?.purchaseUnit ?? "");
    setPerUnit(offering?.unitsPerPurchaseUnit != null ? String(offering.unitsPerPurchaseUnit) : "");
    setLead(offering?.leadTimeDays != null ? String(offering.leadTimeDays) : "");
    setPreferred(offering?.preferred ?? false);
  }, [open, offering]);

  async function save() {
    if (!supplierId) return;
    setSaving(true);
    try {
      await upsert({
        supplierId: supplierId as Id<"suppliers">,
        materialId,
        supplierCode: code.trim() || undefined,
        purchaseUnit: unit.trim() || undefined,
        unitsPerPurchaseUnit: perUnit ? Number(perUnit.replace(",", ".")) : undefined,
        leadTimeDays: lead ? Number(lead) : undefined,
        preferred,
      });
      toast.success(offering ? "Fornecedor salvo" : "Fornecedor vinculado");
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "Não deu para salvar"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={offering ? offering.supplierName : "Vincular fornecedor"} footer={<AppButton label="Salvar" block disabled={!supplierId} loading={saving} onPress={() => void save()} />}>
      <View style={{ gap: space.lg }}>
        {!offering ? (
          <PickerField label="Fornecedor" value={supplierId} onChange={setSupplierId} options={(suppliers ?? []).filter((s) => s.active !== false).map((s) => ({ value: s._id as string, label: s.name }))} searchable loading={suppliers === undefined} placeholder="Escolha o fornecedor" />
        ) : null}
        <Field label="Código no fornecedor (opcional)" value={code} onChangeText={setCode} autoCapitalize="characters" />
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Field label="Unidade de compra" value={unit} onChangeText={setUnit} placeholder="Ex.: rolo" containerStyle={{ flex: 1 }} />
          <Field label="Quantas unidades" value={perUnit} onChangeText={setPerUnit} keyboardType="decimal-pad" placeholder="Ex.: 15" containerStyle={{ flex: 1 }} />
        </View>
        <Field label="Prazo de entrega (dias)" value={lead} onChangeText={(v) => setLead(v.replace(/\D/g, ""))} keyboardType="number-pad" />
        <Toggle label="Fornecedor preferido" description="Aparece primeiro nas sugestões de compra." value={preferred} onChange={setPreferred} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingLeft: space.lg, paddingRight: space.xs, paddingVertical: space.md },
  border: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
});
