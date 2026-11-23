import { useAuth } from "@clerk/expo";
import { api } from "@rlpapp/backend/convex/_generated/api";
import {
  brtMinuteOfDay,
  PUNCH_ROLE_LABEL,
  suggestMissed,
  type MissedPunch,
  type PunchPrompt,
  type PunchPromptOption,
  type PunchSlot,
} from "@rlpapp/shared/rh/pontoDay";
import { useMutation } from "convex/react";
import Constants from "expo-constants";
import * as Location from "expo-location";
import { useRouter, type Href } from "expo-router";
import {
  Camera,
  CheckCircle2,
  Clock,
  CloudOff,
  MapPin,
  RefreshCw,
  UserX,
  WifiOff,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { PunchCamera, type PunchPhoto } from "@/components/ponto/punch-camera";
import { PendingPunchList, TodayPunchList } from "@/components/ponto/punch-lists";
import { PunchPromptSheet } from "@/components/ponto/punch-prompt-sheet";
import { GEOFENCE_LABEL, ReceiptModal, type Receipt } from "@/components/ponto/punch-receipt";
import { TodaySlots } from "@/components/ponto/today-slots";
import {
  AppButton,
  Banner,
  EmptyState,
  LoadingState,
  Pill,
  Surface,
  useToast,
} from "@/components/ui";
import { formatDateKey, toBrtClockLabel, toBrtDateKey } from "@/lib/brt-date";
import { getErrorMessage } from "@/lib/errors";
import { nearestWorksite } from "@/lib/geo";
import { planPunch, readToday, scheduleOf } from "@/lib/punch-plan";
import { syncPunchReminders } from "@/lib/punch-reminders";
import {
  addPendingPunch,
  newClientPunchId,
  persistPunchPhoto,
  type PendingPunch,
} from "@/lib/punch-queue";
import { colors, radius, space, tone, type } from "@/lib/theme";
import { uploadPhotos } from "@/lib/upload-photos";
import { cacheTimeLabel, useCachedQuery } from "@/lib/use-cached-query";
import { useOnline } from "@/lib/use-online";
import { usePendingPunches } from "@/lib/use-pending-punches";

/** A foto vale 5 minutos. */
const PHOTO_MAX_AGE_MS = 5 * 60 * 1000;
const LOCATION_TIMEOUT_MS = 15_000;
/** Posição mais velha que isto é lida de novo na hora de registrar. */
const LOCATION_MAX_AGE_MS = 60_000;

type Position = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
};

type LocationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; position: Position; obtainedAt: number }
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

type PromptState =
  | { mode: "punch"; prompt: PunchPrompt; nowMinute: number }
  | { mode: "forgot"; prompt: PunchPrompt; nowMinute: number };

/**
 * Tela de marcação de ponto (no modelo de um REP-P): foto (opcional ou
 * obrigatória), localização e um botão que já diz o que vai registrar
 * ("Registrar saída para almoço"). No caminho normal é um toque só; quando
 * algo não bate (marcação esquecida, toque repetido, volta depois da saída) o
 * app pergunta antes, com os horários já sugeridos. A pergunta nunca impede a
 * marcação. Sem internet a marcação entra na fila e sobe sozinha depois.
 */
export function PunchScreen() {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const { userId } = useAuth();
  const [now, setNow] = useState(() => Date.now());
  const today = toBrtDateKey(now);
  // Sem sinal, a tela abre com o último contexto salvo (decisão 21).
  const cachedContext = useCachedQuery(userId ? `punch-context:${userId}` : null, api.timeClockPunch.getContext, { date: today });
  const context = cachedContext.data;
  const register = useMutation(api.timeClockPunch.register);
  const requestMissed = useMutation(api.timeClockPunch.requestMissed);
  const generateUploadUrl = useMutation(api.timeClockPunch.generatePhotoUploadUrl);

  const [photo, setPhoto] = useState<PunchPhoto | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [location, setLocation] = useState<LocationState>({ status: "idle" });
  const [sending, setSending] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  // Fila offline deste aparelho (só as marcações deste usuário).
  const pending = usePendingPunches(userId);
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const locationRequested = useRef(false);

  // O dia lido no aparelho (marcações de hoje + fila offline) e o próximo toque.
  const todayRead = useMemo(() => readToday(context, pending, now), [context, pending, now]);
  const plan = useMemo(() => planPunch(context, pending, now), [context, pending, now]);

  // Lembretes locais acompanham o dia (volta do almoço, almoço, saída).
  // Assinatura do que os lembretes usam (data, jornada, papéis e horários do
  // dia lido): muda quando o dia muda, não a cada segundo do relógio.
  const schedule = scheduleOf(context);
  const reminderKey = [
    today,
    schedule.startMinute,
    schedule.endMinute,
    schedule.lunchMinutes,
    schedule.lunchWindowStartMinute,
    schedule.lunchWindowEndMinute,
    todayRead.items.map((item) => `${item.role}@${item.minute}`).join(","),
  ].join("|");
  useEffect(() => {
    if (!context?.allowed) return;
    void syncPunchReminders(readToday(context, pending, Date.now()), scheduleOf(context));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a assinatura cobre o dia e a jornada
  }, [reminderKey, context?.allowed]);

  // Relógio da tela.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);


  const obtainLocation = useCallback(async (): Promise<Position> => {
    setLocation({ status: "loading" });
    try {
      const position = await readPosition();
      setLocation({ status: "ok", position, obtainedAt: Date.now() });
      return position;
    } catch (error) {
      setLocation({ status: "error", message: locationErrorMessage(error) });
      throw error;
    }
  }, []);

  const rules = context?.rules;
  useEffect(() => {
    if (!rules || locationRequested.current) return;
    locationRequested.current = true;
    obtainLocation().catch(() => undefined);
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
    !!context?.allowed &&
    !sending &&
    (!rules?.photoRequired || photoReady) &&
    (!rules?.locationRequired || locationReady);

  /** Toque no botão: confere foto e local e, se algo não bate, pergunta antes. */
  function handlePress() {
    if (!context?.allowed || !rules || sending || !userId) return;
    if (rules.photoRequired && !photoReady) {
      toast.error(photoExpired ? "Foto expirada, tire uma nova foto." : "Tire uma foto para registrar o ponto.");
      return;
    }
    if (rules.locationRequired && !locationReady && location.status !== "error") {
      toast.error("Aguarde a localização ser obtida.");
      return;
    }
    const at = Date.now();
    const next = planPunch(context, pending, at);
    if (next.prompt) {
      setPrompt({ mode: "punch", prompt: next.prompt, nowMinute: brtMinuteOfDay(at) });
      return;
    }
    void handleRegister({});
  }

  /** "Esqueci" num quadro do dia: só o horário, que vai para o RH. */
  function handleForgot(slot: PunchSlot) {
    const at = Date.now();
    const nowMinute = brtMinuteOfDay(at);
    const missed = suggestMissed(todayRead, scheduleOf(context), [slot], nowMinute);
    setPrompt({
      mode: "forgot",
      nowMinute,
      prompt: {
        title: `Esqueci: ${PUNCH_ROLE_LABEL[slot].toLowerCase()}`,
        message: "Confira o horário. O RH recebe e confere.",
        missed,
        options: [{ key: "send", label: "Enviar para o RH", missed }],
      },
    });
  }

  async function sendForgot(missed: MissedPunch[]) {
    if (!online) {
      toast.error("Sem conexão. Tente de novo quando o sinal voltar.");
      return;
    }
    try {
      for (const item of missed) {
        await requestMissed({ date: today, role: item.slot, minute: item.minute });
      }
      toast.show("Horário enviado para o RH.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível enviar o horário"));
    }
  }

  function handleChoice(option: PunchPromptOption) {
    const current = prompt;
    setPrompt(null);
    if (!current || option.cancel) return;
    if (current.mode === "forgot") {
      void sendForgot(option.missed);
      return;
    }
    void handleRegister({ declaredRole: option.declaredRole, missed: option.missed });
  }

  async function handleRegister(choice: { declaredRole?: PunchPromptOption["declaredRole"]; missed?: MissedPunch[] }) {
    if (!context?.allowed || !rules || sending || !userId) return;
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

    // A posição enviada é a de agora: uma leitura antiga (tela aberta há
    // tempo) é refeita antes de registrar.
    let position = location.status === "ok" ? location.position : undefined;
    const stale =
      location.status !== "ok" || Date.now() - location.obtainedAt > LOCATION_MAX_AGE_MS;
    if ((rules.locationRequired || position) && stale) {
      try {
        position = await obtainLocation();
      } catch (error) {
        setSending(false);
        if (rules.locationRequired) {
          toast.error(locationErrorMessage(error));
          return;
        }
        position = undefined;
      }
    }

    const clientPunchId = newClientPunchId();
    const capturedAt = Date.now();
    const base = {
      clientPunchId,
      capturedAt,
      latitude: position?.latitude,
      longitude: position?.longitude,
      accuracyMeters: position?.accuracyMeters,
      photoCapturedAt: photo?.capturedAt,
      declaredRole: choice.declaredRole,
      missed: choice.missed?.length
        ? choice.missed.map((item) => ({ role: item.slot, minute: item.minute }))
        : undefined,
      ...deviceInfo(),
    };

    const queue = async (reason?: string) => {
      await addPendingPunch({
        ...base,
        userId,
        photoUri: photo ? persistPunchPhoto(photo.uri, clientPunchId) : undefined,
      });
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
    if (!online) {
      return (
        <View style={styles.centered}>
          <EmptyState
            icon={<WifiOff size={28} color={colors.warning} />}
            tone="warning"
            title="Sem conexão"
            description="A marcação precisa de internet na primeira vez. Abra esta tela com sinal uma vez e depois ela funciona sem."
          />
        </View>
      );
    }
    return <LoadingState message="Carregando…" />;
  }

  if (!context.allowed) {
    return (
      <View style={styles.centered}>
        <EmptyState
          icon={<UserX size={28} color={colors.warning} />}
          tone="warning"
          title="Ponto pelo app não liberado"
          description="Seu usuário não marca ponto pelo app. Peça ao RH para liberar a marcação de ponto para o seu usuário."
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
        {cachedContext.fromCache && !online ? (
          <Banner
            tone="warning"
            icon={<WifiOff size={18} color={colors.warning} />}
            title={cachedContext.cachedAt ? `Sem conexão · dados de ${cacheTimeLabel(cachedContext.cachedAt)}` : "Sem conexão · dados salvos no aparelho"}
            detail="A marcação fica salva no aparelho e sobe quando o sinal voltar."
          />
        ) : null}
        <Surface style={styles.clockCard}>
          <Text style={[type.caption, { color: colors.textSecondary }]}>
            {context.personName}
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
                  onPress={() => obtainLocation().catch(() => undefined)}
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
                <Pressable onPress={() => obtainLocation().catch(() => undefined)} hitSlop={8}>
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
            label={sending ? "Registrando…" : plan.actionLabel}
            size="lg"
            loading={sending}
            disabled={!canRegister}
            onPress={handlePress}
          />
          <Text style={[type.caption, { color: colors.textSecondary }]}>
            O horário oficial é o do servidor no momento do registro.
          </Text>
        </Surface>

        <TodaySlots day={todayRead} onForgot={online ? handleForgot : undefined} />

        <PendingPunchList pending={pending} online={online} />

        <TodayPunchList
          punches={context.punches}
          onOpenHistory={() => router.push("/minhas-marcacoes" as Href)}
        />
      </ScrollView>

      <PunchCamera
        visible={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(captured) => {
          setPhoto(captured);
          setCameraOpen(false);
        }}
      />

      <PunchPromptSheet
        prompt={prompt?.prompt ?? null}
        nowMinute={prompt?.nowMinute ?? 24 * 60}
        onChoose={handleChoice}
        onClose={() => setPrompt(null)}
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
});
