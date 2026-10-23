import { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import Constants from "expo-constants";
import * as Location from "expo-location";
import {
  Camera,
  CheckCircle2,
  Clock,
  CloudOff,
  CloudUpload,
  MapPin,
  RefreshCw,
  Trash2,
  UserX,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { PunchCamera, type PunchPhoto } from "@/components/ponto/punch-camera";
import {
  AppButton,
  Divider,
  EmptyState,
  LoadingState,
  Pill,
  SectionTitle,
  Surface,
  useToast,
} from "@/components/ui";
import { formatDateKey, toBrtClockLabel, toBrtDateKey, toBrtTimeLabel } from "@/lib/brt-date";
import { getErrorMessage } from "@/lib/errors";
import { nearestWorksite } from "@/lib/geo";
import {
  addPendingPunch,
  listPendingPunches,
  newClientPunchId,
  removePendingPunch,
  requestPunchSync,
  subscribePunchQueue,
  type PendingPunch,
} from "@/lib/punch-queue";
import { colors, radius, space, tone, type } from "@/lib/theme";
import { uploadPhotos } from "@/lib/upload-photos";
import { useOnline } from "@/lib/use-online";

type Context = FunctionReturnType<typeof api.timeClockPunch.getContext>;
type Receipt = FunctionReturnType<typeof api.timeClockPunch.register>;

/** A foto vale 5 minutos (mesma regra do RHID). */
const PHOTO_MAX_AGE_MS = 5 * 60 * 1000;
const LOCATION_TIMEOUT_MS = 15_000;

const KIND_LABEL: Record<Receipt["kind"], string> = {
  entrada: "Entrada",
  almoco_saida: "Saída almoço",
  almoco_retorno: "Retorno almoço",
  saida: "Saída",
};

const GEOFENCE_LABEL = {
  inside: "Dentro da obra",
  outside: "Fora da obra",
  not_controlled: "Sem cerca",
} as const;

type Position = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
};

type LocationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; position: Position }
  | { status: "error"; message: string };

function locationErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/timeout|tempo/i.test(message)) {
    return "Tempo esgotado ao obter localização. Verifique se o GPS está ligado e tente novamente.";
  }
  return "Não foi possível obter sua localização. Verifique se a localização do aparelho está ativada e tente novamente.";
}

async function readPosition(): Promise<Position> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Permita o acesso à localização para registrar o ponto.");
  }
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), LOCATION_TIMEOUT_MS)
  );
  const result = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest }),
    timeout,
  ]);
  return {
    latitude: result.coords.latitude,
    longitude: result.coords.longitude,
    accuracyMeters: result.coords.accuracy ?? undefined,
  };
}

function deviceInfo() {
  return {
    deviceModel: `${Platform.OS} ${Constants.deviceName ?? ""}`.trim(),
    appVersion: Constants.expoConfig?.version ?? undefined,
  };
}

/**
 * Tela de marcação de ponto (clone do REP-P do RHID): foto (opcional ou
 * obrigatória), localização e o botão "Registrar ponto". Sem internet a
 * marcação entra na fila e sobe sozinha depois.
 */
export function PunchScreen() {
  const toast = useToast();
  const online = useOnline();
  const [now, setNow] = useState(() => Date.now());
  const today = toBrtDateKey(now);
  const context = useQuery(api.timeClockPunch.getContext, { date: today });
  const register = useMutation(api.timeClockPunch.register);
  const generateUploadUrl = useMutation(api.timeClockPunch.generatePhotoUploadUrl);

  const [photo, setPhoto] = useState<PunchPhoto | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [location, setLocation] = useState<LocationState>({ status: "idle" });
  const [sending, setSending] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [pending, setPending] = useState<PendingPunch[]>([]);
  const locationRequested = useRef(false);

  // Relógio da tela.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fila offline deste aparelho.
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void listPendingPunches().then((items) => {
        if (alive) setPending(items);
      });
    };
    refresh();
    const unsubscribe = subscribePunchQueue(refresh);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const obtainLocation = useCallback(async () => {
    setLocation({ status: "loading" });
    try {
      const position = await readPosition();
      setLocation({ status: "ok", position });
    } catch (error) {
      setLocation({ status: "error", message: locationErrorMessage(error) });
    }
  }, []);

  const rules = context?.rules;
  useEffect(() => {
    if (!rules || locationRequested.current) return;
    locationRequested.current = true;
    void obtainLocation();
  }, [rules, obtainLocation]);

  const photoAgeMs = photo ? now - photo.capturedAt : 0;
  const photoExpired = photo !== null && photoAgeMs > PHOTO_MAX_AGE_MS;
  const photoSecondsLeft = photo ? Math.max(0, Math.ceil((PHOTO_MAX_AGE_MS - photoAgeMs) / 1000)) : 0;

  const preview = useMemo(() => {
    if (!context || location.status !== "ok") return null;
    return nearestWorksite(location.position, context.worksites);
  }, [context, location]);

  const photoReady = Boolean(photo) && !photoExpired;
  const locationReady = location.status === "ok";
  const canRegister =
    !!context?.employee &&
    !sending &&
    (!rules?.photoRequired || photoReady) &&
    (!rules?.locationRequired || locationReady);

  async function handleRegister() {
    if (!context?.employee || !rules || sending) return;
    if (rules.photoRequired && !photoReady) {
      toast.error(photoExpired ? "Foto expirada, tire uma nova foto." : "Tire uma foto para registrar o ponto.");
      return;
    }
    if (rules.locationRequired && !locationReady) {
      toast.error(
        location.status === "error" ? location.message : "Aguarde a localização ser obtida."
      );
      return;
    }
    setSending(true);
    const clientPunchId = newClientPunchId();
    const capturedAt = Date.now();
    const position = location.status === "ok" ? location.position : undefined;
    const base = {
      clientPunchId,
      capturedAt,
      latitude: position?.latitude,
      longitude: position?.longitude,
      accuracyMeters: position?.accuracyMeters,
      photoCapturedAt: photo?.capturedAt,
      ...deviceInfo(),
    };

    const queue = async (reason?: string) => {
      await addPendingPunch({ ...base, photoUri: photo?.uri });
      setPhoto(null);
      toast.show(
        reason ??
          "Sem conexão: marcação guardada no aparelho e será enviada automaticamente."
      );
    };

    try {
      if (!online) {
        await queue();
        return;
      }
      let photoStorageId: Awaited<ReturnType<typeof uploadPhotos>>[number] | undefined;
      if (photo) {
        [photoStorageId] = await uploadPhotos(generateUploadUrl, [photo.uri]);
      }
      const result = await register({ ...base, photoStorageId });
      setReceipt(result);
      setPhoto(null);
    } catch (error) {
      const message = getErrorMessage(error, "Erro ao registrar ponto");
      // Erros de rede: guarda e tenta depois. Erros de regra: mostra na hora.
      if (/network|fetch|conex|timeout|socket/i.test(message) || !online) {
        await queue("Falha de conexão: marcação guardada e será reenviada.");
      } else {
        toast.error(message);
      }
    } finally {
      setSending(false);
    }
  }

  if (context === undefined) {
    return <LoadingState message="Carregando…" />;
  }

  if (!context.employee) {
    return (
      <View style={styles.centered}>
        <EmptyState
          icon={<UserX size={28} color={colors.warning} />}
          tone="warning"
          title="Usuário sem funcionário vinculado"
          description="Peça ao RH para vincular seu usuário ao seu cadastro de funcionário. Depois disso a marcação de ponto fica liberada aqui."
        />
      </View>
    );
  }

  const steps = [
    rules?.photoRequired ? "foto" : null,
    rules?.locationRequired ? "local" : null,
    "registrar",
  ].filter(Boolean);
  const stepNumber = (step: string) => steps.indexOf(step) + 1;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Surface style={styles.clockCard}>
          <Text style={[type.caption, { color: colors.textSecondary }]}>
            {context.employee.name}
            {context.employee.jobTitle ? ` · ${context.employee.jobTitle}` : ""}
          </Text>
          <Text style={styles.clock}>{toBrtClockLabel(now)}</Text>
          <Text style={[type.bodySm, { color: colors.textSecondary }]}>
            {formatDateKey(today)} · Horário de Brasília
          </Text>
          {!online ? (
            <Pill label="Sem conexão" tone="warning" icon={<CloudOff size={12} color={tone.warning.fg} />} />
          ) : null}
        </Surface>

        {/* Foto */}
        <Surface style={styles.stepCard}>
          <StepHeader
            number={rules?.photoRequired ? stepNumber("foto") : null}
            title={rules?.photoRequired ? "Capture sua foto" : "Foto (opcional)"}
            icon={<Camera size={18} color={colors.primary} />}
          />
          <View style={styles.photoRow}>
            <View style={styles.photoBox}>
              {photo ? (
                <Image source={{ uri: photo.uri }} style={styles.photo} />
              ) : (
                <Camera size={28} color={colors.textMuted} />
              )}
            </View>
            <View style={{ flex: 1, gap: space.sm }}>
              {photo ? (
                photoExpired ? (
                  <Text style={[type.bodySm, { color: colors.danger }]}>
                    Foto expirada, tire uma nova foto para registrar o ponto.
                  </Text>
                ) : (
                  <Text style={[type.bodySm, { color: colors.textSecondary }]}>
                    Foto expira em {Math.floor(photoSecondsLeft / 60)}:
                    {String(photoSecondsLeft % 60).padStart(2, "0")}
                  </Text>
                )
              ) : (
                <Text style={[type.bodySm, { color: colors.textSecondary }]}>
                  A foto é tirada na hora, com a câmera frontal.
                </Text>
              )}
              <AppButton
                label={photo ? "Nova foto" : "Tirar foto"}
                variant="secondary"
                size="sm"
                trailing={null}
                icon={<Camera size={18} color={colors.text} />}
                onPress={() => setCameraOpen(true)}
              />
            </View>
          </View>
        </Surface>

        {/* Localização */}
        {rules?.locationRequired ? (
          <Surface style={styles.stepCard}>
            <StepHeader
              number={stepNumber("local")}
              title="Confirme seu local"
              icon={<MapPin size={18} color={colors.primary} />}
            />
            {location.status === "loading" || location.status === "idle" ? (
              <LoadingState message="Obtendo localização…" style={{ paddingVertical: space.md }} />
            ) : location.status === "error" ? (
              <View style={{ gap: space.sm }}>
                <Text style={[type.bodySm, { color: colors.danger }]}>{location.message}</Text>
                <AppButton
                  label="Tentar novamente"
                  variant="secondary"
                  size="sm"
                  trailing={null}
                  icon={<RefreshCw size={16} color={colors.text} />}
                  onPress={() => void obtainLocation()}
                />
              </View>
            ) : (
              <View style={{ gap: space.sm }}>
                <View style={styles.inlineRow}>
                  <CheckCircle2 size={16} color={colors.success} />
                  <Text style={[type.bodySm, { color: colors.text }]}>
                    Localização obtida
                    {location.position.accuracyMeters
                      ? ` (±${Math.round(location.position.accuracyMeters)} m)`
                      : ""}
                  </Text>
                </View>
                {preview ? (
                  <Pill
                    label={
                      preview.inside
                        ? `Na obra ${preview.worksite.name}`
                        : `A ${preview.distanceMeters} m de ${preview.worksite.name}`
                    }
                    tone={preview.inside ? "success" : "warning"}
                  />
                ) : (
                  <Text style={[type.caption, { color: colors.textSecondary }]}>
                    Nenhuma obra cadastrada com cerca.
                  </Text>
                )}
                <Text style={[type.caption, { color: colors.textMuted }]}>
                  {location.position.latitude.toFixed(6)}, {location.position.longitude.toFixed(6)}
                </Text>
                <Pressable onPress={() => void obtainLocation()} hitSlop={8}>
                  <Text style={[type.label, { color: colors.primary }]}>Atualizar localização</Text>
                </Pressable>
              </View>
            )}
          </Surface>
        ) : null}

        {/* Registrar */}
        <Surface style={styles.stepCard}>
          <StepHeader
            number={stepNumber("registrar")}
            title="Registre seu ponto"
            icon={<Clock size={18} color={colors.primary} />}
          />
          <AppButton
            label={sending ? "Registrando…" : "Registrar ponto"}
            size="lg"
            loading={sending}
            disabled={!canRegister}
            onPress={() => void handleRegister()}
          />
          <Text style={[type.caption, { color: colors.textSecondary }]}>
            O horário oficial é o do servidor no momento do registro.
          </Text>
        </Surface>

        {pending.length > 0 ? (
          <>
            <SectionTitle title="Aguardando envio" style={{ paddingHorizontal: 0 }} />
            <Surface padded={false}>
              {pending.map((item, index) => (
                <View key={item.clientPunchId}>
                  {index > 0 ? <Divider /> : null}
                  <View style={styles.pendingRow}>
                    {item.error ? (
                      <CloudOff size={18} color={colors.danger} />
                    ) : (
                      <CloudUpload size={18} color={colors.warning} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[type.bodyStrong, { color: colors.text }]}>
                        {formatDateKey(toBrtDateKey(item.capturedAt))} às {toBrtTimeLabel(item.capturedAt)}
                      </Text>
                      <Text style={[type.caption, { color: item.error ? colors.danger : colors.textSecondary }]}>
                        {item.error ?? (online ? "Enviando…" : "Aguardando conexão")}
                      </Text>
                    </View>
                    {item.error ? (
                      <Pressable
                        onPress={() => void removePendingPunch(item.clientPunchId)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Descartar marcação pendente"
                      >
                        <Trash2 size={18} color={colors.danger} />
                      </Pressable>
                    ) : (
                      <Pressable onPress={requestPunchSync} hitSlop={8} accessibilityRole="button">
                        <RefreshCw size={18} color={colors.primary} />
                      </Pressable>
                    )}
                  </View>
                </View>
              ))}
            </Surface>
          </>
        ) : null}

        <SectionTitle title="Marcações de hoje" style={{ paddingHorizontal: 0 }} />
        {context.punches.length === 0 ? (
          <Surface>
            <Text style={[type.bodySm, { color: colors.textSecondary }]}>
              Nenhuma marcação registrada hoje.
            </Text>
          </Surface>
        ) : (
          <Surface padded={false}>
            {context.punches.map((punch, index) => (
              <View key={punch._id}>
                {index > 0 ? <Divider /> : null}
                <View style={styles.pendingRow}>
                  <Text style={styles.punchTime}>{punch.timeLabel}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.bodyStrong, { color: colors.text }]}>{KIND_LABEL[punch.kind]}</Text>
                    <Text style={[type.caption, { color: colors.textSecondary }]}>
                      {punch.worksiteName ?? "Sem obra"}
                      {punch.offline ? " · offline" : ""}
                      {punch.nsr ? ` · NSR ${punch.nsr}` : ""}
                    </Text>
                  </View>
                  {punch.geofenceStatus ? (
                    <Pill
                      label={GEOFENCE_LABEL[punch.geofenceStatus]}
                      tone={
                        punch.geofenceStatus === "inside"
                          ? "success"
                          : punch.geofenceStatus === "outside"
                            ? "warning"
                            : "neutral"
                      }
                    />
                  ) : null}
                </View>
              </View>
            ))}
          </Surface>
        )}
      </ScrollView>

      <PunchCamera
        visible={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(captured) => {
          setPhoto(captured);
          setCameraOpen(false);
        }}
      />

      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
    </View>
  );
}

function StepHeader({
  number,
  title,
  icon,
}: {
  number: number | null;
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <View style={styles.stepHeader}>
      <View style={styles.stepIcon}>{icon}</View>
      <Text style={[type.heading, { color: colors.text, flex: 1 }]}>
        {number ? `${number}. ` : ""}
        {title}
      </Text>
    </View>
  );
}

/** "Ponto registrado": nome, horário oficial, obra, NSR e hash (como no RHID). */
function ReceiptModal({ receipt, onClose }: { receipt: Receipt | null; onClose: () => void }) {
  return (
    <Modal visible={receipt !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.receipt}>
          <View style={styles.receiptIcon}>
            <CheckCircle2 size={34} color={colors.success} />
          </View>
          <Text style={[type.title, { color: colors.text, textAlign: "center" }]}>Ponto registrado</Text>
          {receipt ? (
            <View style={{ gap: space.xs, alignItems: "center" }}>
              <Text style={[type.bodyStrong, { color: colors.text }]}>{receipt.employeeName}</Text>
              <Text style={[type.body, { color: colors.text }]}>
                {formatDateKey(receipt.date)} às {receipt.timeLabel} · {KIND_LABEL[receipt.kind]}
              </Text>
              <Text style={[type.bodySm, { color: colors.textSecondary }]}>
                {receipt.worksiteName
                  ? `${GEOFENCE_LABEL[receipt.geofenceStatus]} · ${receipt.worksiteName}`
                  : GEOFENCE_LABEL[receipt.geofenceStatus]}
              </Text>
              <Text style={[type.caption, { color: colors.textSecondary }]}>NSR {receipt.nsr}</Text>
              <Text selectable style={styles.hash}>
                {receipt.hash}
              </Text>
              {receipt.duplicate ? (
                <Text style={[type.caption, { color: colors.warning }]}>
                  Esta marcação já havia sido registrada.
                </Text>
              ) : null}
            </View>
          ) : null}
          <AppButton label="Ok" onPress={onClose} trailing={null} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.screen,
    paddingTop: space.md,
    paddingBottom: space.xxl,
    gap: space.md,
  },
  centered: { flex: 1, justifyContent: "center", paddingHorizontal: space.screen },
  clockCard: { alignItems: "center", gap: space.xs },
  clock: { fontSize: 44, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] },
  stepCard: { gap: space.md },
  stepHeader: { flexDirection: "row", alignItems: "center", gap: space.sm },
  stepIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  photoRow: { flexDirection: "row", gap: space.md, alignItems: "center" },
  photoBox: {
    width: 96,
    height: 120,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  photo: { width: "100%", height: "100%" },
  inlineRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  punchTime: { ...type.heading, color: colors.text, width: 56, fontVariant: ["tabular-nums"] },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
  },
  receipt: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.xl,
    gap: space.lg,
    alignItems: "stretch",
  },
  receiptIcon: { alignItems: "center" },
  hash: {
    ...type.caption,
    color: colors.textMuted,
    textAlign: "center",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
});
