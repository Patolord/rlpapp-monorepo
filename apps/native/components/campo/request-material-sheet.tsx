import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Trash2 } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppButton, IconButton, QuantityStepper, SearchField, Sheet, Surface, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { formatMaterialLabel } from "@/lib/format";
import { colors, radius, space, type } from "@/lib/theme";

export type CatalogMaterial = {
  materialId: Id<"materials">;
  name: string;
  variantLabel: string | null;
  unit: string | null;
};

export type DraftLine = CatalogMaterial & {
  quantity: number;
  reason: "replenishment" | "new";
  markedDepleted: boolean;
};

/**
 * Pedido de material para o escritório: busca no catálogo da empresa (recentes
 * e itens da obra primeiro), monta linhas com quantidade e envia.
 */
export function RequestMaterialSheet({
  open,
  onClose,
  projectId,
  initialMaterial,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  projectId: Id<"projects">;
  initialMaterial?: DraftLine | null;
  onSubmitted?: () => void;
}) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [selected, setSelected] = useState<CatalogMaterial | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const createRequest = useMutation(api.inventoryRequests.createRequest);
  const suggestions = useQuery(api.inventoryRequests.listPickerSuggestions, open ? { projectId } : "skip");
  const trimmed = search.trim();
  const catalog = useQuery(
    api.inventoryRequests.searchCatalog,
    open && trimmed.length >= 2 ? { search: trimmed } : "skip"
  );

  useEffect(() => {
    if (!open) {
      setSearch("");
      setQuantity(1);
      setSelected(null);
      setLines([]);
      return;
    }
    if (initialMaterial) {
      setSelected(initialMaterial);
      setQuantity(initialMaterial.quantity);
    }
  }, [open, initialMaterial]);

  const visible = useMemo(() => {
    const recents = suggestions?.recents ?? [];
    const common = (suggestions?.common ?? []).filter(
      (item) => !recents.some((recent) => recent.materialId === item.materialId)
    );
    return { recents, common };
  }, [suggestions]);

  function lineMeta(materialId: Id<"materials">) {
    if (initialMaterial?.materialId === materialId) {
      return { reason: initialMaterial.reason, markedDepleted: initialMaterial.markedDepleted };
    }
    const onObra = (suggestions?.common ?? []).some((item) => item.materialId === materialId);
    return { reason: onObra ? ("replenishment" as const) : ("new" as const), markedDepleted: false };
  }

  function addSelected() {
    if (!selected) {
      toast.error("Escolha um material");
      return;
    }
    const material = selected;
    const meta = lineMeta(material.materialId);
    setLines((current) => {
      const existing = current.find((line) => line.materialId === material.materialId);
      if (existing) {
        return current.map((line) =>
          line.materialId === material.materialId ? { ...line, quantity: line.quantity + quantity } : line
        );
      }
      return [...current, { ...material, quantity, ...meta }];
    });
    setSelected(null);
    setQuantity(1);
    setSearch("");
  }

  async function submit() {
    const payload: DraftLine[] =
      lines.length > 0 ? lines : selected ? [{ ...selected, quantity, ...lineMeta(selected.materialId) }] : [];
    if (payload.length === 0) {
      toast.error("Adicione pelo menos um material");
      return;
    }
    setSubmitting(true);
    try {
      await createRequest({
        projectId,
        items: payload.map((line) => ({
          materialId: line.materialId,
          quantity: line.quantity,
          reason: line.reason,
          markedDepleted: line.markedDepleted,
        })),
      });
      toast.success("Pedido enviado para o escritório");
      onClose();
      onSubmitted?.();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível enviar o pedido"));
    } finally {
      setSubmitting(false);
    }
  }

  const itemCount = lines.length > 0 ? lines.length : selected ? 1 : 0;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Pedir material"
      subtitle="Recentes e itens da obra primeiro. Só o catálogo da empresa."
      footer={
        <AppButton
          label={itemCount > 1 ? `Enviar pedido (${itemCount} itens)` : "Enviar pedido"}
          onPress={() => void submit()}
          loading={submitting}
          disabled={itemCount === 0}
        />
      }
    >
      <SearchField value={search} onChangeText={setSearch} placeholder="Buscar no catálogo" />

      {trimmed.length < 2 ? (
        <View style={{ gap: space.xl }}>
          {visible.recents.length > 0 ? (
            <ChipGroup title="Recentes" items={visible.recents} selectedId={selected?.materialId ?? null} onPick={setSelected} />
          ) : null}
          {visible.common.length > 0 ? (
            <ChipGroup title="Nesta obra" items={visible.common} selectedId={selected?.materialId ?? null} onPick={setSelected} />
          ) : null}
          {suggestions && visible.recents.length === 0 && visible.common.length === 0 ? (
            <Text style={[type.bodySm, styles.hint]}>Digite para buscar no catálogo.</Text>
          ) : null}
        </View>
      ) : catalog === undefined ? (
        <Text style={[type.bodySm, styles.hint]}>Buscando...</Text>
      ) : catalog.length === 0 ? (
        <Text style={[type.bodySm, styles.hint]}>Nenhum material encontrado.</Text>
      ) : (
        <View style={{ gap: space.sm }}>
          {catalog.map((item) => {
            const isSelected = selected?.materialId === item.materialId;
            return (
              <Pressable
                key={item.materialId}
                onPress={() => setSelected(item)}
                style={[styles.result, isSelected && { borderColor: colors.primary, backgroundColor: colors.primarySoft }]}
              >
                <Text style={[type.bodyStrong, { color: colors.text }]}>{formatMaterialLabel(item.name, item.variantLabel)}</Text>
                {item.unit ? <Text style={[type.caption, { color: colors.textMuted }]}>{item.unit}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      )}

      {selected ? (
        <Surface style={{ gap: space.lg }}>
          <Text style={[type.bodyStrong, { color: colors.text }]}>
            {formatMaterialLabel(selected.name, selected.variantLabel)}
            {selected.unit ? <Text style={{ color: colors.textMuted }}> · {selected.unit}</Text> : null}
          </Text>
          <QuantityStepper value={quantity} onChange={setQuantity} />
          <AppButton label="Adicionar ao pedido" variant="secondary" onPress={addSelected} />
        </Surface>
      ) : null}

      {lines.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <Text style={[type.eyebrow, { color: colors.textSecondary }]}>Neste pedido</Text>
          {lines.map((line) => (
            <Surface key={line.materialId} style={styles.line} padded={false}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={2}>
                  {formatMaterialLabel(line.name, line.variantLabel)}
                </Text>
                <Text style={[type.caption, { color: colors.textMuted }]}>
                  {line.quantity} {line.unit ?? ""}
                </Text>
              </View>
              <IconButton
                label="Remover"
                size={36}
                tone="ghost"
                onPress={() => setLines((current) => current.filter((item) => item.materialId !== line.materialId))}
                icon={<Trash2 size={18} color={colors.danger} strokeWidth={2} />}
              />
            </Surface>
          ))}
        </View>
      ) : null}
    </Sheet>
  );
}

function ChipGroup({
  title,
  items,
  selectedId,
  onPick,
}: {
  title: string;
  items: CatalogMaterial[];
  selectedId: Id<"materials"> | null;
  onPick: (item: CatalogMaterial) => void;
}) {
  return (
    <View style={{ gap: space.sm }}>
      <Text style={[type.eyebrow, { color: colors.textSecondary }]}>{title}</Text>
      <View style={styles.chips}>
        {items.map((item) => {
          const active = selectedId === item.materialId;
          return (
            <Pressable
              key={item.materialId}
              onPress={() => onPick(item)}
              style={[styles.chip, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
            >
              <Text style={[type.label, { color: active ? colors.onPrimary : colors.text }]}>
                {formatMaterialLabel(item.name, item.variantLabel)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { color: colors.textSecondary, textAlign: "center", paddingVertical: space.xl },
  result: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: 12,
    gap: 2,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingLeft: space.lg,
    paddingRight: space.sm,
    paddingVertical: 10,
  },
});
