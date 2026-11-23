import { api } from "@rlpapp/backend/convex/_generated/api";
import {
  brtMinuteOfDay,
  PUNCH_ROLE_LABEL,
  suggestMissed,
  type ClassifiedDay,
  type PunchPrompt,
  type PunchPromptOption,
  type PunchSlot,
} from "@rlpapp/shared/rh/pontoDay";
import { useMutation, useQuery } from "convex/react";
import { Stack } from "expo-router";
import { CalendarClock } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { PunchPromptSheet } from "@/components/ponto/punch-prompt-sheet";
import { TodaySlots } from "@/components/ponto/today-slots";
import { Chips, EmptyState, LoadingState, useToast } from "@/components/ui";
import { formatDateKey, toBrtDateKey } from "@/lib/brt-date";
import { getErrorMessage } from "@/lib/errors";
import { useNativeHeaderOptions } from "@/lib/native-header";
import { fromDayDetail } from "@/lib/punch-plan";
import { colors, space, type } from "@/lib/theme";

type Range = "7" | "30";
type Forgot = { date: string; prompt: PunchPrompt; nowMinute: number };

/**
 * Minhas marcações (ficha P2): os últimos dias em quatro quadros. O que
 * ficou sem marcação mostra "Esqueci": a pessoa confere o horário sugerido e
 * manda para o RH. Pedido que o RH ainda não viu pode ser desfeito.
 */
export default function MinhasMarcacoesScreen() {
  const header = useNativeHeaderOptions();
  const toast = useToast();
  const [range, setRange] = useState<Range>("7");
  const [now] = useState(() => Date.now());
  const today = toBrtDateKey(now);
  const from = toBrtDateKey(now - (Number(range) - 1) * 86_400_000);
  const data = useQuery(api.timeClockPunch.myDays, { from, to: today, today });
  const requestMissed = useMutation(api.timeClockPunch.requestMissed);
  const cancelRequest = useMutation(api.timeClockPunch.cancelRequest);
  const [forgot, setForgot] = useState<Forgot | null>(null);

  const days = useMemo(
    () => (data?.days ?? []).map((detail) => ({ detail, day: fromDayDetail(detail) })),
    [data]
  );

  function openForgot(date: string, day: ClassifiedDay, slot: PunchSlot) {
    if (!data) return;
    // A tela pode ter ficado aberta desde ontem: a data de hoje é a de agora.
    const at = Date.now();
    const nowMinute = date === toBrtDateKey(at) ? brtMinuteOfDay(at) : 24 * 60;
    const missed = suggestMissed(day, data.schedule, [slot], nowMinute);
    setForgot({
      date,
      nowMinute,
      prompt: {
        title: `Esqueci: ${PUNCH_ROLE_LABEL[slot].toLowerCase()}`,
        message: `${formatDateKey(date)}. Confira o horário. O RH recebe e confere.`,
        missed,
        options: [{ key: "send", label: "Enviar para o RH", missed }],
      },
    });
  }

  async function send(option: PunchPromptOption) {
    const current = forgot;
    setForgot(null);
    if (!current || option.cancel) return;
    try {
      for (const item of option.missed) {
        await requestMissed({ date: current.date, role: item.slot, minute: item.minute });
      }
      toast.show("Horário enviado para o RH.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível enviar o horário"));
    }
  }

  return (
    <>
      <Stack.Screen options={{ ...header, title: "Minhas marcações" }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
        <Chips<Range>
          items={[
            { key: "7", label: "Últimos 7 dias" },
            { key: "30", label: "Últimos 30 dias" },
          ]}
          active={range}
          onChange={setRange}
          style={{ paddingHorizontal: 0 }}
        />
        {data === undefined ? (
          <LoadingState />
        ) : days.length === 0 ? (
          <EmptyState
            icon={<CalendarClock size={28} color={colors.primary} />}
            title="Nenhuma marcação no período"
            description="As marcações feitas pelo app aparecem aqui."
          />
        ) : (
          days.map(({ detail, day }) => {
            const pending = detail.items.filter((item) => item.basis === "pending" && item.requestId);
            const worksites = [...new Set(detail.items.map((item) => item.worksiteName).filter(Boolean))];
            return (
              <View key={detail.date} style={{ gap: space.xs }}>
                <Text style={[type.bodyStrong, { color: colors.text }]}>{formatDateKey(detail.date)}</Text>
                <TodaySlots
                  day={day}
                  onForgot={(slot) => openForgot(detail.date, day, slot)}
                  missedNotSent={detail.missedNotSent > 0}
                />
                {worksites.length > 0 ? (
                  <Text style={styles.foot}>{worksites.join(" · ")}</Text>
                ) : null}
                {pending.map((item) => (
                  <View key={item.id} style={styles.pendingRow}>
                    <Text style={[type.caption, { color: colors.warning, flex: 1 }]}>
                      {PUNCH_ROLE_LABEL[item.role]} às {item.timeLabel} aguarda o RH
                    </Text>
                    <Pressable
                      hitSlop={8}
                      accessibilityRole="button"
                      onPress={() =>
                        void cancelRequest({ requestId: item.requestId! }).catch((error) =>
                          toast.error(getErrorMessage(error, "Não foi possível desfazer"))
                        )
                      }
                    >
                      <Text style={[type.label, { color: colors.primary }]}>Desfazer</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            );
          })
        )}
      </ScrollView>
      <PunchPromptSheet
        prompt={forgot?.prompt ?? null}
        nowMinute={forgot?.nowMinute ?? 24 * 60}
        onChoose={(option) => void send(option)}
        onClose={() => setForgot(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.screen, paddingBottom: 48, gap: space.lg },
  foot: { ...type.caption, color: colors.textSecondary },
  pendingRow: { flexDirection: "row", alignItems: "center", gap: space.md },
});
