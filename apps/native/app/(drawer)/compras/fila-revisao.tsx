import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Check, ClipboardCheck, Copy, EyeOff, Truck } from "lucide-react-native";
import { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { MaterialPickerField, type PickedMaterial } from "@/components/compras/material-picker";
import { PriceEventRow, type PriceEvent } from "@/components/compras/price-event-row";
import { AppButton, EmptyState, LoadingState, PickerField, ScreenHeader, Sheet, screenStyles, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { colors, space, type } from "@/lib/theme";

/** Fila de preços que precisam de revisão (material/fornecedor não identificados). */
export default function FilaRevisaoScreen() {
  const toast = useToast();
  const [now] = useState(() => Date.now());
  const queue = useQuery(api.priceEvents.reviewQueue, { now });
  const updateReview = useMutation(api.priceEvents.updateReview);
  const [reviewing, setReviewing] = useState<PriceEvent | null>(null);
  const [material, setMaterial] = useState<PickedMaterial | null>(null);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const suppliers = useQuery(api.suppliers.list, reviewing ? { activeOnly: true } : "skip");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function setStatus(event: PriceEvent, reviewStatus: "reviewed" | "ignored" | "duplicate", extra?: { materialId?: Id<"materials">; supplierId?: Id<"suppliers"> }) {
    setBusyId(event._id);
    try {
      await updateReview({ eventId: event._id, reviewStatus, ...extra });
      toast.success(reviewStatus === "reviewed" ? "Preço revisado" : reviewStatus === "ignored" ? "Preço ignorado" : "Marcado como duplicado");
      setReviewing(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível atualizar"));
    } finally {
      setBusyId(null);
    }
  }

  function openReview(event: PriceEvent) {
    setReviewing(event);
    setMaterial(event.materialId && event.materialName ? { materialId: event.materialId, name: event.materialName, variantLabel: null, unit: event.unit } : null);
    setSupplierId(event.supplierId ?? null);
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Revisão" subtitle={queue === undefined ? "Preços a conferir" : `${queue.length} pendente${queue.length === 1 ? "" : "s"}`} />
      {queue === undefined ? (
        <LoadingState />
      ) : (
        <FlatList
          data={queue}
          keyExtractor={(item) => item._id}
          contentContainerStyle={screenStyles.content}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<EmptyState icon={<ClipboardCheck size={30} color={colors.success} strokeWidth={1.8} />} title="Fila vazia" description="Nenhum preço aguardando revisão." tone="success" />}
          renderItem={({ item }) => (
            <PriceEventRow event={item}>
              <View style={styles.actions}>
                <AppButton label="Revisar" size="sm" trailing={null} icon={<Check size={18} color={colors.onPrimary} strokeWidth={2.2} />} onPress={() => openReview(item)} style={{ flex: 1 }} />
                <AppButton label="Ignorar" variant="secondary" size="sm" icon={<EyeOff size={18} color={colors.text} strokeWidth={2} />} loading={busyId === item._id} onPress={() => void setStatus(item, "ignored")} />
                <AppButton label="Duplicado" variant="secondary" size="sm" icon={<Copy size={18} color={colors.text} strokeWidth={2} />} onPress={() => void setStatus(item, "duplicate")} />
              </View>
            </PriceEventRow>
          )}
        />
      )}

      <Sheet
        open={reviewing !== null}
        onClose={() => setReviewing(null)}
        title="Revisar preço"
        subtitle={reviewing?.rawDescription ?? reviewing?.materialName ?? undefined}
        maxHeight={0.8}
        footer={<AppButton label="Confirmar revisão" loading={busyId === reviewing?._id} onPress={() => reviewing && void setStatus(reviewing, "reviewed", { materialId: material?.materialId, supplierId: (supplierId as Id<"suppliers"> | null) ?? undefined })} />}
      >
        <Text style={[type.bodySm, { color: colors.textSecondary }]}>
          Vincule o material e o fornecedor corretos antes de confirmar. Campos vazios mantêm o que já estava no evento.
        </Text>
        <MaterialPickerField value={material} onChange={setMaterial} />
        <PickerField
          label="Fornecedor"
          icon={<Truck size={24} color={colors.icon} strokeWidth={1.6} />}
          value={supplierId}
          onChange={setSupplierId}
          options={(suppliers ?? []).map((s) => ({ value: s._id as string, label: s.name }))}
          loading={suppliers === undefined}
          searchable
          clearable
          placeholder={reviewing?.supplierName ?? "Selecionar"}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: space.sm, marginTop: 4 },
});
