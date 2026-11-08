import { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useAction, useQuery } from "convex/react";
import { CheckCircle2, RefreshCw } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { AppButton, Banner, ChoiceGroup, Field, KeyValueList, LoadingState, SectionTitle } from "@/components/ui";
import { formatDateKey, toBrtDateKey } from "@/lib/brt-date";
import { getErrorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { colors, space, type } from "@/lib/theme";

type Preset = "hoje" | "7" | "mes" | "outro";
type Summary = FunctionReturnType<typeof api.rhidSync.syncRange>;

const MAX_DAYS = 62;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** "08/11/2026" → "2026-11-08". */
function parseBr(value: string): string | null {
  const m = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const key = `${m[3]}-${m[2]}-${m[1]}`;
  return DATE_RE.test(key) && !Number.isNaN(Date.parse(key)) ? key : null;
}

function maskBr(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Sincronizar período com o RHID (ficha R11), até 62 dias. */
export default function SincronizarScreen() {
  const status = useQuery(api.timeClock.getSyncStatus, {});
  const syncRange = useAction(api.rhidSync.syncRange);
  const [preset, setPreset] = useState<Preset>("hoje");
  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const now = Date.now();
  const today = toBrtDateKey(now);
  const range = (() => {
    if (preset === "hoje") return { from: today, to: today };
    if (preset === "7") return { from: toBrtDateKey(now - 6 * 86_400_000), to: today };
    if (preset === "mes") return { from: `${today.slice(0, 8)}01`, to: today };
    const from = parseBr(fromText);
    const to = parseBr(toText);
    return from && to ? { from, to } : null;
  })();
  const rangeError = (() => {
    if (preset !== "outro") return undefined;
    if (!range) return fromText || toText ? "Use datas no formato dd/mm/aaaa" : undefined;
    if (range.from > range.to) return "A data inicial vem depois da final";
    if (range.to > today) return "A data final não pode ser no futuro";
    if (daysBetween(range.from, range.to) > MAX_DAYS) return `No máximo ${MAX_DAYS} dias por vez`;
    return undefined;
  })();

  async function run() {
    if (!range || rangeError) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      setResult(await syncRange(range));
    } catch (err) {
      setError(getErrorMessage(err, "Não deu para sincronizar. Tente de novo."));
    } finally {
      setRunning(false);
    }
  }

  if (status === undefined) return <LoadingState />;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {!status.configured ? (
        <Banner tone="warning" title="Integração com o RHID não configurada" detail="Sem a credencial no servidor não há o que sincronizar. Fale com o administrador." />
      ) : status.lastSyncStatus === "error" ? (
        <Banner tone="danger" title="A última sincronização falhou" detail={status.lastSyncError ?? undefined} />
      ) : status.lastSyncFinishedAt ? (
        <Banner
          tone="neutral"
          icon={<CheckCircle2 size={18} color={colors.success} />}
          title={`Última sincronização ${formatDateTime(status.lastSyncFinishedAt)}`}
          detail={status.lastSyncFrom && status.lastSyncTo ? `${formatDateKey(status.lastSyncFrom)} a ${formatDateKey(status.lastSyncTo)}${status.lastSyncTrigger === "cron" ? " · automática" : ""}` : undefined}
        />
      ) : null}

      <Text style={[type.bodySm, { color: colors.textSecondaryOnBg }]}>
        O app já busca o dia de hoje a cada 5 minutos e os últimos 7 dias toda madrugada. Use esta tela para buscar um período de novo depois de um ajuste no RHID.
      </Text>

      <ChoiceGroup<Preset>
        label="Período"
        value={preset}
        onChange={setPreset}
        options={[
          { value: "hoje", label: "Hoje" },
          { value: "7", label: "Últimos 7 dias" },
          { value: "mes", label: "Este mês" },
          { value: "outro", label: "Outro período" },
        ]}
      />

      {preset === "outro" ? (
        <View style={styles.dates}>
          <Field label="De" value={fromText} onChangeText={(v) => setFromText(maskBr(v))} placeholder="dd/mm/aaaa" keyboardType="number-pad" containerStyle={{ flex: 1 }} />
          <Field label="Até" value={toText} onChangeText={(v) => setToText(maskBr(v))} placeholder="dd/mm/aaaa" keyboardType="number-pad" containerStyle={{ flex: 1 }} />
        </View>
      ) : null}
      {rangeError ? <Text style={[type.bodySm, { color: colors.destructive }]}>{rangeError}</Text> : null}

      {error ? <Banner tone="danger" title={error} actionLabel="Tentar de novo" onAction={() => void run()} /> : null}

      <AppButton
        label="Sincronizar"
        block
        icon={<RefreshCw size={18} color={colors.onPrimary} />}
        disabled={!status.configured || !range || Boolean(rangeError)}
        loading={running}
        loadingLabel="Sincronizando…"
        onPress={() => void run()}
      />

      {result ? (
        <View style={{ gap: space.sm }}>
          <SectionTitle title="Resultado" />
          <KeyValueList
              items={[
                { label: "Período", value: `${formatDateKey(result.from)} a ${formatDateKey(result.to)}` },
                { label: "Marcações", value: String(result.punches) },
                { label: "Novas", value: String(result.inserted) },
                { label: "Atualizadas", value: String(result.updated) },
                { label: "Removidas", value: String(result.deleted) },
                { label: "Pessoas", value: String(result.people) },
              ]}
            />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.screen, paddingBottom: 48, gap: space.lg },
  dates: { flexDirection: "row", gap: space.sm },
});
