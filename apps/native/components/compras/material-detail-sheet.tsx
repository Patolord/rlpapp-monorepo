import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatCurrency, formatDate } from "@rlpapp/shared";
import { useMutation, useQuery } from "convex/react";
import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  AppButton,
  ConfirmDialog,
  EmptyState,
  Field,
  KeyValueList,
  LoadingState,
  Pill,
  SectionTitle,
  Sheet,
  Surface,
  useToast,
} from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { formatQty } from "@/lib/format";
import { colors, space, type } from "@/lib/theme";

import { FRESHNESS, MATERIAL_STATUS, PRICE_SOURCE, REPLENISHMENT } from "./labels";
import { MaterialFormSheet } from "./material-form-sheet";

/** Detalhe do material: dados, estoque central, apelidos, últimos preços. */
export function MaterialDetailSheet({ materialId, onClose }: { materialId: Id<"materials"> | null; onClose: () => void }) {
  const toast = useToast();
  const [now] = useState(() => Date.now());
  const material = useQuery(api.materials.get, materialId ? { materialId } : "skip");
  const aliases = useQuery(api.materials.listAliases, materialId ? { materialId } : "skip");
  const prices = useQuery(api.priceEvents.latestForMaterial, materialId ? { materialId, now } : "skip");
  const update = useMutation(api.materials.update);
  const addAlias = useMutation(api.materials.addAlias);

  const [editing, setEditing] = useState(false);
  const [alias, setAlias] = useState("");
  const [addingAlias, setAddingAlias] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState(false);

  const archived = material?.status === "archived" || material?.active === false;

  async function toggleArchive() {
    if (!material) return;
    setBusy(true);
    try {
      await update({ materialId: material._id, status: archived ? "active" : "archived", active: archived });
      toast.success(archived ? "Material reativado" : "Material arquivado");
      setConfirmArchive(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível alterar o status"));
    } finally {
      setBusy(false);
    }
  }

  async function submitAlias() {
    if (!material || !alias.trim()) return;
    setAddingAlias(true);
    try {
      await addAlias({ materialId: material._id, alias: alias.trim() });
      setAlias("");
      toast.success("Apelido adicionado");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível adicionar o apelido"));
    } finally {
      setAddingAlias(false);
    }
  }

  return (
    <>
      <Sheet
        open={materialId !== null}
        onClose={onClose}
        title={material?.name ?? "Material"}
        subtitle={material ? [material.variantLabel, material.sku].filter(Boolean).join(" · ") || undefined : undefined}
        footer={
          material ? (
            <View style={styles.footer}>
              <AppButton label="Editar" variant="secondary" icon={<Pencil size={20} color={colors.text} strokeWidth={2} />} onPress={() => setEditing(true)} style={{ flex: 1 }} />
              <AppButton
                label={archived ? "Reativar" : "Arquivar"}
                variant="secondary"
                icon={archived ? <ArchiveRestore size={20} color={colors.primary} strokeWidth={2} /> : <Archive size={20} color={colors.danger} strokeWidth={2} />}
                onPress={() => (archived ? void toggleArchive() : setConfirmArchive(true))}
                loading={busy && archived}
                style={{ flex: 1 }}
              />
            </View>
          ) : undefined
        }
      >
        {material === undefined ? (
          <LoadingState style={{ flex: 0, paddingVertical: space.xxl }} />
        ) : material === null ? (
          <EmptyState title="Material não encontrado" />
        ) : (
          <>
            <View style={styles.pills}>
              <Pill label={MATERIAL_STATUS[material.status ?? (material.active ? "active" : "archived")]?.label ?? "—"} tone={MATERIAL_STATUS[material.status ?? "active"]?.tone ?? "neutral"} />
              <Pill label={REPLENISHMENT[material.centralReplenishmentState]?.label ?? material.centralReplenishmentState} tone={REPLENISHMENT[material.centralReplenishmentState]?.tone ?? "neutral"} />
              {material.centralQuantity != null ? <Pill label={`Central: ${formatQty(material.centralQuantity, material.unit)}`} tone="info" /> : null}
            </View>
            <KeyValueList
              items={[
                { label: "Categoria", value: material.category },
                { label: "Unidade", value: material.unit },
                { label: "Fabricante", value: material.manufacturer },
                { label: "Marca preferida", value: material.brandPreference },
                { label: "Código de barras", value: material.barcode },
                { label: "Especificação", value: material.spec },
                {
                  label: "Atributos técnicos",
                  value: material.technicalAttributes && material.technicalAttributes.length > 0 ? material.technicalAttributes.map((a) => `${a.key}: ${a.value}`).join("\n") : null,
                },
                { label: "Criado em", value: formatDate(material.createdAt) },
              ]}
            />

            <View>
              <SectionTitle title="Apelidos" style={styles.section} />
              <Text style={[type.caption, { color: colors.textMuted, marginBottom: space.sm, marginLeft: 4 }]}>
                Outros nomes pelos quais o material é pedido (ajudam a busca e a importação).
              </Text>
              {aliases && aliases.length > 0 ? (
                <View style={styles.aliases}>
                  {aliases.map((a) => (
                    <Pill key={a._id} label={a.alias} tone="neutral" />
                  ))}
                </View>
              ) : null}
              <View style={styles.aliasRow}>
                <Field label="Novo apelido" size="md" value={alias} onChangeText={setAlias} containerStyle={{ flex: 1 }} returnKeyType="done" onSubmitEditing={() => void submitAlias()} />
                <AppButton label="Adicionar" size="sm" trailing={null} icon={<Plus size={18} color={colors.onPrimary} strokeWidth={2.2} />} disabled={!alias.trim()} loading={addingAlias} onPress={() => void submitAlias()} />
              </View>
            </View>

            <View>
              <SectionTitle title="Últimos preços" style={styles.section} />
              {prices === undefined ? (
                <LoadingState style={{ flex: 0, paddingVertical: space.lg }} />
              ) : prices.length === 0 ? (
                <Surface style={{ alignItems: "center", paddingVertical: space.lg }}>
                  <Text style={[type.bodySm, { color: colors.textSecondary }]}>Nenhum preço registrado.</Text>
                </Surface>
              ) : (
                <Surface padded={false}>
                  {prices.slice(0, 5).map((p, index) => (
                    <View key={p._id} style={[styles.price, index > 0 && styles.priceBorder]}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                          {p.supplierName}
                        </Text>
                        <Text style={[type.caption, { color: colors.textMuted }]}>
                          {formatDate(p.occurredAt)} · {PRICE_SOURCE[p.source] ?? p.source}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 4 }}>
                        <Text style={[type.bodyStrong, { color: colors.text }]}>
                          {formatCurrency(p.unitPriceCents)}
                          {p.unit ? <Text style={[type.caption, { color: colors.textMuted }]}>/{p.unit}</Text> : null}
                        </Text>
                        <Pill label={FRESHNESS[p.freshness]?.label ?? p.freshness} tone={FRESHNESS[p.freshness]?.tone ?? "neutral"} />
                      </View>
                    </View>
                  ))}
                </Surface>
              )}
            </View>
          </>
        )}
      </Sheet>

      {material ? <MaterialFormSheet open={editing} onClose={() => setEditing(false)} material={material} /> : null}

      <ConfirmDialog
        open={confirmArchive}
        title="Arquivar material?"
        description="Sai das buscas e dos pedidos; o histórico de preços e estoque é mantido. Pode ser reativado depois."
        confirmLabel="Arquivar"
        destructive
        busy={busy}
        onCancel={() => setConfirmArchive(false)}
        onConfirm={() => void toggleArchive()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: "row", gap: space.md },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  section: { paddingHorizontal: 4, paddingTop: 0, paddingBottom: 6 },
  aliases: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.md },
  aliasRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  price: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: 12 },
  priceBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
});
