import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AppButton, Field, Sheet, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { colors, space, type } from "@/lib/theme";

import type { HierarchyTower } from "./types";

function defaultLabel(n: number): string {
  if (n === 0) return "Térreo";
  if (n < 0) return `Subsolo ${Math.abs(n)}`;
  return `${n}º andar`;
}

/** Adiciona um intervalo de andares a uma torre. */
export function FloorsAddSheet({ open, onClose, tower }: { open: boolean; onClose: () => void; tower: HierarchyTower | null }) {
  const toast = useToast();
  const createFloors = useMutation(api.floors.create);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [saving, setSaving] = useState(false);

  const existing = useMemo(() => new Set((tower?.floors ?? []).map((f) => f.number)), [tower]);
  const maxExisting = tower && tower.floors.length > 0 ? Math.max(...tower.floors.map((f) => f.number)) : null;

  useEffect(() => {
    if (!open) return;
    const next = maxExisting === null ? 1 : maxExisting + 1;
    setFrom(String(next));
    setTo(String(next));
  }, [open, maxExisting]);

  const a = Number.parseInt(from, 10);
  const b = Number.parseInt(to, 10);
  const range = Number.isFinite(a) && Number.isFinite(b) ? Array.from({ length: Math.abs(b - a) + 1 }, (_, i) => Math.min(a, b) + i) : [];
  const toCreate = range.filter((n) => !existing.has(n));

  async function submit() {
    if (!tower || toCreate.length === 0) return;
    setSaving(true);
    try {
      await createFloors({
        towerId: tower._id as Id<"towers">,
        floors: toCreate.map((number) => ({ number, label: defaultLabel(number) })),
      });
      toast.success(`${toCreate.length} andar${toCreate.length === 1 ? "" : "es"} adicionado${toCreate.length === 1 ? "" : "s"}`);
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível adicionar andares"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Adicionar andares"
      subtitle={tower?.name}
      maxHeight={0.7}
      footer={
        <AppButton
          label={toCreate.length > 0 ? `Adicionar ${toCreate.length} andar${toCreate.length === 1 ? "" : "es"}` : "Informe o intervalo"}
          disabled={toCreate.length === 0}
          loading={saving}
          onPress={() => void submit()}
        />
      }
    >
      <View style={styles.row}>
        <Field label="De" value={from} onChangeText={setFrom} keyboardType="numbers-and-punctuation" containerStyle={{ flex: 1 }} autoFocus />
        <Field label="Até" value={to} onChangeText={setTo} keyboardType="numbers-and-punctuation" containerStyle={{ flex: 1 }} />
      </View>
      <Text style={[type.caption, { color: colors.textMuted }]}>
        Use 0 para o térreo e números negativos para subsolos. Andares já existentes são ignorados
        {range.length > toCreate.length ? ` (${range.length - toCreate.length} no intervalo)` : ""}.
      </Text>
      {toCreate.length > 0 ? (
        <Text style={[type.bodySm, { color: colors.textSecondary }]}>
          {toCreate.slice(0, 6).map(defaultLabel).join(", ")}
          {toCreate.length > 6 ? ` … e mais ${toCreate.length - 6}` : ""}
        </Text>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.md },
});
