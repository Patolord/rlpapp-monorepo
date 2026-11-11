import { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex/react";
import { Stack } from "expo-router";
import { CalendarClock } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { PUNCH_KIND } from "@/components/rh/labels";
import { Chips, Divider, EmptyState, LoadingState, Pill, Surface } from "@/components/ui";
import { formatDateKey, toBrtDateKey } from "@/lib/brt-date";
import { useNativeHeaderOptions } from "@/lib/native-header";
import { colors, space, type } from "@/lib/theme";

type Punch = FunctionReturnType<typeof api.timeClockPunch.myPunches>[number];
type Range = "7" | "30";

const KIND_ORDER = ["entrada", "almoco_saida", "almoco_retorno", "saida"] as const;

/** Minhas marcações (ficha P2): os últimos dias com as quatro marcações. */
export default function MinhasMarcacoesScreen() {
  const header = useNativeHeaderOptions();
  const [range, setRange] = useState<Range>("7");
  const [now] = useState(() => Date.now());
  const to = toBrtDateKey(now);
  const from = toBrtDateKey(now - (Number(range) - 1) * 86_400_000);
  const punches = useQuery(api.timeClockPunch.myPunches, { from, to });

  const days = useMemo(() => {
    const map = new Map<string, Punch[]>();
    for (const p of punches ?? []) map.set(p.date, [...(map.get(p.date) ?? []), p]);
    return [...map.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([date, list]) => ({ date, list: list.sort((x, y) => x.punchedAt - y.punchedAt) }));
  }, [punches]);

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
        {punches === undefined ? (
          <LoadingState />
        ) : days.length === 0 ? (
          <EmptyState
            icon={<CalendarClock size={28} color={colors.primary} />}
            title="Nenhuma marcação no período"
            description="As marcações feitas pelo app aparecem aqui."
          />
        ) : (
          days.map(({ date, list }) => (
            <Surface key={date} padded={false}>
              <View style={styles.dayHead}>
                <Text style={[type.bodyStrong, { color: colors.text, flex: 1 }]}>{formatDateKey(date)}</Text>
                <Text style={[type.caption, { color: colors.textSecondary }]}>
                  {list.length} {list.length === 1 ? "marcação" : "marcações"}
                </Text>
              </View>
              <Divider />
              <View style={styles.grid}>
                {KIND_ORDER.map((kind) => {
                  const p = list.find((x) => x.kind === kind);
                  return (
                    <View key={kind} style={styles.cell}>
                      <Text style={[type.caption, { color: colors.textSecondary }]}>{PUNCH_KIND[kind]}</Text>
                      <Text style={[type.heading, { color: p ? colors.text : colors.controlDisabledText }]}>{p?.timeLabel ?? "--:--"}</Text>
                      {p?.geofenceStatus === "outside" ? <Pill label="Fora da cerca" tone="warning" /> : null}
                    </View>
                  );
                })}
              </View>
              {list.some((p) => p.worksiteName) ? (
                <Text style={styles.foot}>{[...new Set(list.map((p) => p.worksiteName).filter(Boolean))].join(" · ")}</Text>
              ) : null}
            </Surface>
          ))
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.screen, paddingBottom: 48, gap: space.md },
  dayHead: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingVertical: space.md },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: space.sm, paddingVertical: space.sm },
  cell: { width: "50%", padding: space.sm, gap: 2 },
  foot: { ...type.caption, color: colors.textSecondary, paddingHorizontal: space.lg, paddingBottom: space.md },
});
