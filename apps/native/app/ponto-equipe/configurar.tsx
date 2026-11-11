import { api } from "@rlpapp/backend/convex/_generated/api";
import { formatCurrency } from "@rlpapp/shared";
import { useMutation, useQuery } from "convex/react";
import { useRouter, type Href } from "expo-router";
import { MapPinned, Users } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { AppButton, Banner, Divider, Field, ListRow, LoadingState, SectionTitle, Surface, Toggle, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { parseCurrencyInput, toCurrencyInput } from "@/lib/format";
import { colors, space } from "@/lib/theme";

/** Configurar ponto: regras da marcação, custo do homem-dia, quem bate ponto e cercas. */
export default function ConfigurarPontoScreen() {
  const router = useRouter();
  const toast = useToast();
  const settings = useQuery(api.timeClock.getTimeClockSettings, {});
  const people = useQuery(api.timeClock.listClockPeople, {});
  const worksites = useQuery(api.timeClock.listWorksites, {});
  const update = useMutation(api.timeClock.updateTimeClockSettings);

  const [cost, setCost] = useState("");
  const [windowText, setWindowText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setCost(toCurrencyInput(settings.manDayCostCents));
    setWindowText(String(settings.duplicateWindowMinutes));
  }, [settings]);

  if (settings === undefined) return <LoadingState />;

  const clockingPeople = (people ?? []).filter((p) => p.clocksIn).length;
  const worksitesWithoutFence = (worksites ?? []).filter((w) => !w.geofence).length;

  const costCents = parseCurrencyInput(cost);
  const windowMinutes = Number(windowText);
  const costError = cost && costCents === null ? "Valor inválido" : undefined;
  const windowError = windowText && (!Number.isInteger(windowMinutes) || windowMinutes < 0 || windowMinutes > 60) ? "Entre 0 e 60 minutos" : undefined;
  const dirty = costCents !== settings.manDayCostCents || windowMinutes !== settings.duplicateWindowMinutes;

  async function toggleRule(key: "photoRequired" | "locationRequired", value: boolean) {
    try {
      await update({ [key]: value });
    } catch (err) {
      toast.error(getErrorMessage(err, "Não deu para salvar. Tente de novo."));
    }
  }

  async function save() {
    if (costError || windowError || costCents === null) return;
    setSaving(true);
    setError(null);
    try {
      await update({ manDayCostCents: costCents, duplicateWindowMinutes: windowMinutes });
      toast.success("Configuração salva");
    } catch (err) {
      setError(getErrorMessage(err, "Não deu para salvar. Tente de novo."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.group}>
        <SectionTitle title="Marcação pelo app" />
        <Surface padded={false}>
          <Toggle label="Exigir foto" description="A pessoa tira uma foto na hora de marcar." value={settings.photoRequired} onChange={(v) => void toggleRule("photoRequired", v)} style={styles.toggle} />
          <Divider inset={space.lg} />
          <Toggle label="Exigir localização" description="Sem GPS a marcação não sai." value={settings.locationRequired} onChange={(v) => void toggleRule("locationRequired", v)} style={styles.toggle} />
        </Surface>
      </View>

      <View style={styles.group}>
        <SectionTitle title="Regras do mês" />
        <Surface style={{ gap: space.lg }}>
          <Field
            label="Janela de marcação repetida (minutos)"
            helper="Uma segunda marcação da mesma pessoa dentro desse tempo é recusada."
            value={windowText}
            onChangeText={(v) => setWindowText(v.replace(/\D/g, ""))}
            keyboardType="number-pad"
            error={windowError}
          />
          <Field
            label="Custo do homem-dia (R$)"
            helper={costCents !== null ? `Usado no custo estimado do mês: ${formatCurrency(costCents)} por diária.` : undefined}
            value={cost}
            onChangeText={setCost}
            keyboardType="decimal-pad"
            error={costError}
          />
        </Surface>
        {error ? <Banner tone="danger" title={error} actionLabel="Tentar de novo" onAction={() => void save()} /> : null}
        <AppButton label="Salvar" block disabled={!dirty || Boolean(costError || windowError)} loading={saving} loadingLabel="Salvando…" onPress={() => void save()} />
      </View>

      <View style={styles.group}>
        <SectionTitle title="Pessoas e obras" />
        <View style={{ gap: space.sm }}>
          <ListRow
            icon={<Users size={20} color={colors.primary} />}
            title="Quem bate ponto"
            subtitle={people === undefined ? "Carregando…" : clockingPeople === 1 ? "1 pessoa marca pelo app" : `${clockingPeople} pessoas marcam pelo app`}
            onPress={() => router.push("/ponto-equipe/pessoas" as Href)}
            chevron
          />
          <ListRow
            icon={<MapPinned size={20} color={colors.primary} />}
            title="Cercas das obras"
            subtitle={worksites === undefined ? "Carregando…" : worksitesWithoutFence > 0 ? `${worksitesWithoutFence} sem cerca` : "Todas com cerca"}
            onPress={() => router.push("/ponto-equipe/cercas" as Href)}
            chevron
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.screen, paddingBottom: 48, gap: space.xl },
  group: { gap: space.sm },
  toggle: { paddingHorizontal: space.lg, paddingVertical: space.md },
});
