import { useAuth } from "@clerk/expo";
import { AlertTriangle, CheckCircle2, Clock, CloudUpload, RotateCw, Trash2, Wrench } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { StatusBadge } from "@/components/engenharia/status-badge";
import { AppButton, Banner, ConfirmDialog, EmptyState, LoadingState, SectionTitle, Surface } from "@/components/ui";
import { getMaintenanceLogTypeLabel } from "@/lib/maintenance-log-type";
import { removePendingRecord, requestOfflineSync, type PendingRecord } from "@/lib/offline-queue";
import { removePendingPunch, requestPunchSync, type PendingPunch } from "@/lib/punch-queue";
import { colors, radius, space, type } from "@/lib/theme";
import { useOnline } from "@/lib/use-online";
import { usePendingPunches, usePendingRecords } from "@/lib/use-pending-records";

type Discard =
  | { kind: "record"; id: string; label: string }
  | { kind: "punch"; id: string; label: string };

function when(ts: number): string {
  return new Date(ts).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Pendentes (ficha C11): o que foi salvo no aparelho e ainda não subiu. */
export function PendingRecordsView() {
  const insets = useSafeAreaInsets();
  const online = useOnline();
  const { userId } = useAuth();
  const records = usePendingRecords();
  const punches = usePendingPunches(userId);
  const [discard, setDiscard] = useState<Discard | null>(null);

  function sendNow() {
    requestOfflineSync();
    requestPunchSync();
  }

  async function confirmDiscard() {
    if (!discard) return;
    if (discard.kind === "record") await removePendingRecord(discard.id);
    else await removePendingPunch(discard.id);
    setDiscard(null);
  }

  if (records === undefined || punches === undefined) return <LoadingState />;
  const total = records.length + punches.length;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        {total === 0 ? (
          <EmptyState
            tone="success"
            icon={<CheckCircle2 size={28} color={colors.success} />}
            title="Nada esperando sinal"
            description="Registros, cadastros e marcações de ponto feitos sem internet aparecem aqui até serem enviados."
            style={{ marginTop: space.xxl }}
          />
        ) : (
          <>
            <Banner
              tone={online ? "info" : "warning"}
              icon={<CloudUpload size={18} color={online ? colors.info : colors.warning} />}
              title={`${total} ${total === 1 ? "item salvo" : "itens salvos"} no aparelho`}
              detail={online ? "Envia sozinho em instantes. Se preferir, toque em Enviar agora." : "Sem internet agora. Envia sozinho quando o sinal voltar."}
            />
            <AppButton
              label="Enviar agora"
              block
              disabled={!online}
              icon={<CloudUpload size={18} color={online ? colors.onPrimary : colors.controlDisabledText} />}
              onPress={sendNow}
            />

            {records.length > 0 ? (
              <View style={styles.group}>
                <SectionTitle title="Registros de campo" />
                {records.map((record) => (
                  <RecordCard
                    key={record.id}
                    record={record}
                    online={online}
                    onRetry={sendNow}
                    onDiscard={() => setDiscard({ kind: "record", id: record.id, label: recordTitle(record) })}
                  />
                ))}
              </View>
            ) : null}

            {punches.length > 0 ? (
              <View style={styles.group}>
                <SectionTitle title="Marcações de ponto" />
                {punches.map((punch) => (
                  <PunchCard
                    key={punch.clientPunchId}
                    punch={punch}
                    online={online}
                    onRetry={sendNow}
                    onDiscard={() => setDiscard({ kind: "punch", id: punch.clientPunchId, label: `Ponto de ${when(punch.capturedAt)}` })}
                  />
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <ConfirmDialog
        open={discard !== null}
        title={discard?.kind === "punch" ? "Descartar esta marcação de ponto?" : "Descartar este registro?"}
        description={`${discard?.label ?? ""} sai do aparelho e não será enviado. Não dá para desfazer.`}
        confirmLabel="Descartar"
        destructive
        onConfirm={() => void confirmDiscard()}
        onCancel={() => setDiscard(null)}
      />
    </View>
  );
}

function recordTitle(record: PendingRecord): string {
  return record.kind === "equipment" ? "Cadastro de equipamento" : `Registro de ${getMaintenanceLogTypeLabel(record.logType)}`;
}

function CardActions({ error, online, onRetry, onDiscard }: { error?: string; online: boolean; onRetry: () => void; onDiscard: () => void }) {
  return (
    <>
      {error ? (
        <View style={styles.error}>
          <AlertTriangle size={16} color={colors.destructive} />
          <Text style={[type.bodySm, { color: colors.destructive, flex: 1 }]}>{error}</Text>
        </View>
      ) : null}
      <View style={styles.actions}>
        {error ? (
          <Pressable accessibilityRole="button" disabled={!online} onPress={onRetry} style={styles.action} hitSlop={6}>
            <RotateCw size={16} color={online ? colors.primary : colors.controlDisabledText} />
            <Text style={[type.label, { color: online ? colors.primary : colors.controlDisabledText, fontWeight: "600" }]}>Tentar de novo</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={onDiscard} style={styles.action} hitSlop={6}>
          <Trash2 size={16} color={colors.destructive} />
          <Text style={[type.label, { color: colors.destructive, fontWeight: "600" }]}>Descartar</Text>
        </Pressable>
      </View>
    </>
  );
}

function RecordCard({ record, online, onRetry, onDiscard }: { record: PendingRecord; online: boolean; onRetry: () => void; onDiscard: () => void }) {
  const projectName = record.kind === "equipment" ? record.projectName : undefined;
  const meta = [
    `Etiqueta ${record.qrToken}`,
    projectName,
    `${record.photos.length} ${record.photos.length === 1 ? "foto" : "fotos"}`,
    when(record.createdAt),
  ].filter(Boolean);
  return (
    <Surface style={styles.card}>
      <View style={styles.head}>
        <View style={styles.tile}>
          <Wrench size={18} color={colors.primary} />
        </View>
        <Text style={[type.bodyStrong, styles.title]} numberOfLines={2}>
          {recordTitle(record)}
        </Text>
        <StatusBadge status={record.status} />
      </View>
      <Text style={styles.meta}>{meta.join(" · ")}</Text>
      <CardActions error={record.error} online={online} onRetry={onRetry} onDiscard={onDiscard} />
    </Surface>
  );
}

function PunchCard({ punch, online, onRetry, onDiscard }: { punch: PendingPunch; online: boolean; onRetry: () => void; onDiscard: () => void }) {
  const meta = [when(punch.capturedAt), punch.photoUri ? "com foto" : null, punch.latitude !== undefined ? "com localização" : null].filter(Boolean);
  return (
    <Surface style={styles.card}>
      <View style={styles.head}>
        <View style={styles.tile}>
          <Clock size={18} color={colors.primary} />
        </View>
        <Text style={[type.bodyStrong, styles.title]}>Marcação de ponto</Text>
      </View>
      <Text style={styles.meta}>{meta.join(" · ")}</Text>
      <CardActions error={punch.error} online={online} onRetry={onRetry} onDiscard={onDiscard} />
    </Surface>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.screen, gap: space.lg },
  group: { gap: space.sm },
  card: { gap: space.sm },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  tile: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, color: colors.text },
  meta: { ...type.bodySm, color: colors.textSecondary },
  error: { flexDirection: "row", gap: space.sm, alignItems: "flex-start", backgroundColor: colors.dangerSoft, borderRadius: radius.sm, padding: space.md },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: space.xl, paddingTop: space.xs },
  action: { flexDirection: "row", alignItems: "center", gap: space.xs, minHeight: 32 },
});
