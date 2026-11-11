import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { AppButton, Banner, Field, Sheet, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { parseCurrencyInput, toCurrencyInput } from "@/lib/format";
import { colors, space, type } from "@/lib/theme";

export type RunParameters = {
  _id: Id<"payrollRuns">;
  mealVoucherPerDayCents: number;
  foodBasketCents: number;
  defaultDailyTransitCents: number;
  defaultTransportFoodDays: number;
};

/** Parâmetros do mês (ficha R6). Salvar recalcula todas as linhas da folha. */
export function RunParametersSheet({
  run,
  open,
  editable,
  onClose,
}: {
  run: RunParameters | null;
  open: boolean;
  editable: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const update = useMutation(api.payroll.updateRunParameters);
  const [meal, setMeal] = useState("");
  const [basket, setBasket] = useState("");
  const [transit, setTransit] = useState("");
  const [days, setDays] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!run || !open) return;
    setMeal(toCurrencyInput(run.mealVoucherPerDayCents));
    setBasket(toCurrencyInput(run.foodBasketCents));
    setTransit(toCurrencyInput(run.defaultDailyTransitCents));
    setDays(String(run.defaultTransportFoodDays));
    setError(null);
  }, [run, open]);

  const values = {
    mealVoucherPerDayCents: parseCurrencyInput(meal),
    foodBasketCents: parseCurrencyInput(basket),
    defaultDailyTransitCents: parseCurrencyInput(transit),
    defaultTransportFoodDays: days === "" ? null : Number(days),
  };
  const invalid = Object.values(values).some((v) => v === null || Number.isNaN(v));

  async function save() {
    if (!run || invalid) return;
    setSaving(true);
    setError(null);
    try {
      await update({
        runId: run._id,
        mealVoucherPerDayCents: values.mealVoucherPerDayCents!,
        foodBasketCents: values.foodBasketCents!,
        defaultDailyTransitCents: values.defaultDailyTransitCents!,
        defaultTransportFoodDays: values.defaultTransportFoodDays!,
      });
      toast.success("Parâmetros salvos e folha recalculada");
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Não deu para salvar. Tente de novo."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Parâmetros do mês"
      subtitle={editable ? "Valem para todas as linhas desta folha." : "Folha fechada: só leitura."}
      footer={editable ? <AppButton label="Salvar e recalcular" block disabled={invalid} loading={saving} loadingLabel="Recalculando…" onPress={() => void save()} /> : undefined}
    >
      <View style={{ gap: space.lg }}>
        <Field label="Vale alimentação por dia (R$)" value={meal} onChangeText={setMeal} keyboardType="decimal-pad" editable={editable} error={meal && values.mealVoucherPerDayCents === null ? "Valor inválido" : undefined} />
        <Field label="Cesta básica (R$)" value={basket} onChangeText={setBasket} keyboardType="decimal-pad" editable={editable} error={basket && values.foodBasketCents === null ? "Valor inválido" : undefined} />
        <Field label="Passagem por dia, padrão (R$)" value={transit} onChangeText={setTransit} keyboardType="decimal-pad" editable={editable} error={transit && values.defaultDailyTransitCents === null ? "Valor inválido" : undefined} />
        <Field label="Dias de transporte e alimentação, padrão" value={days} onChangeText={(v) => setDays(v.replace(/\D/g, ""))} keyboardType="number-pad" editable={editable} />
        {editable ? (
          <Text style={[type.bodySm, { color: colors.textSecondary }]}>
            Ao salvar, os totais de todos os funcionários desta folha são recalculados com estes valores.
          </Text>
        ) : null}
        {error ? <Banner tone="danger" title={error} /> : null}
      </View>
    </Sheet>
  );
}
