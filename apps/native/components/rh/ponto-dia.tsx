import { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex/react";
import { ChevronLeft, ChevronRight, Clock, MapPin } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { PunchPhoto } from "@/components/rh/punch-photo";
import { PUNCH_KIND } from "@/components/rh/labels";
import { Divider, EmptyState, IconButton, LoadingState, Pill, SectionTitle, Sheet, StatTile, Surface } from "@/components/ui";
import { formatDateKey } from "@/lib/brt-date";
import { colors, space, type } from "@/lib/theme";

type Day = FunctionReturnType<typeof api.timeClock.getDay>;
type Person = Day["people"][number];
type DayPunch = Day["punches"][number];

function shiftDay(dateKey: string, delta: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d! + delta));
  return date.toISOString().slice(0, 10);
}

function openMap(lat: number, lng: number, label: string) {
  const q = encodeURIComponent(label);
  const url = Platform.OS === "ios" ? `http://maps.apple.com/?ll=${lat},${lng}&q=${q}` : `geo:${lat},${lng}?q=${lat},${lng}(${q})`;
  void Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`));
}

/** Ponto da equipe — dia (ficha R9): marcações por pessoa, foto e mapa. */
export function PontoDia({ today }: { today: string }) {
  const [date, setDate] = useState(today);
  const [person, setPerson] = useState<Person | null>(null);
  const day = useQuery(api.timeClock.getDay, { date });

  const punchesByPerson = useMemo(() => {
    const map = new Map<number, DayPunch[]>();
    for (const p of day?.punches ?? []) map.set(p.rhidPersonId, [...(map.get(p.rhidPersonId) ?? []), p]);
    return map;
  }, [day]);

  const people = useMemo(
    () => [...(day?.people ?? [])].sort((a, b) => Number(b.present) - Number(a.present) || (a.employee?.name ?? a.name).localeCompare(b.employee?.name ?? b.name)),
    [day]
  );
  const selected = person ? punchesByPerson.get(person.rhidPersonId) ?? [] : [];

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.bar}>
        <IconButton label="Dia anterior" icon={<ChevronLeft size={20} color={colors.text} />} onPress={() => setDate((d) => shiftDay(d, -1))} />
        <Text style={[type.heading, { color: colors.text, flex: 1, textAlign: "center" }]}>{date === today ? "Hoje" : formatDateKey(date)}</Text>
        <IconButton label="Próximo dia" disabled={date >= today} icon={<ChevronRight size={20} color={date >= today ? colors.controlDisabledText : colors.text} />} onPress={() => setDate((d) => shiftDay(d, 1))} />
      </View>
      {day === undefined ? (
        <LoadingState />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.stats}>
            <StatTile label="Presentes" value={day.summary.present} tone="success" hint={`de ${day.summary.total}`} />
            <StatTile label="Ausentes" value={day.summary.absent} tone={day.summary.absent > 0 ? "warning" : "neutral"} />
            <StatTile label="Marcações" value={day.summary.punches} />
          </View>
          <SectionTitle title="Pessoas" style={styles.section} />
          {people.length === 0 ? (
            <EmptyState icon={<Clock size={28} color={colors.primary} />} title="Ninguém acompanhado neste dia" description="Confira os departamentos acompanhados em Configurar ponto." />
          ) : (
            <Surface padded={false}>
              {people.map((p, index) => (
                <Pressable
                  key={p.rhidPersonId}
                  onPress={() => setPerson(p)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.row, index > 0 && styles.border, pressed && { backgroundColor: colors.surfacePressed }]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                      {p.employee?.name ?? p.name}
                    </Text>
                    <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                      {p.present
                        ? [p.worksiteName, `${p.punchCount} ${p.punchCount === 1 ? "marcação" : "marcações"}`].filter(Boolean).join(" · ")
                        : "Sem marcação"}
                    </Text>
                  </View>
                  <Pill label={p.present ? "Presente" : "Ausente"} tone={p.present ? "success" : "warning"} />
                  <ChevronRight size={18} color={colors.icon} />
                </Pressable>
              ))}
            </Surface>
          )}
        </ScrollView>
      )}

      <Sheet open={person !== null} onClose={() => setPerson(null)} title={person?.employee?.name ?? person?.name ?? ""} subtitle={date === today ? "Hoje" : formatDateKey(date)}>
        {selected.length === 0 ? (
          <Text style={[type.bodySm, { color: colors.textSecondary }]}>Nenhuma marcação neste dia.</Text>
        ) : (
          <View style={{ gap: space.md }}>
            <Surface padded={false}>
              {selected.map((punch, index) => (
                <View key={punch._id}>
                  {index > 0 ? <Divider /> : null}
                  <View style={styles.punch}>
                    <Text style={[type.heading, { color: colors.text, width: 64 }]}>{punch.timeLabel}</Text>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[type.bodyStrong, { color: colors.text }]}>{PUNCH_KIND[punch.kind] ?? punch.kind}</Text>
                      <Text style={[type.caption, { color: colors.textSecondary }]}>
                        {[punch.geofenceName ?? "Fora de cerca", punch.source === "app" ? "pelo app" : "RHID"].join(" · ")}
                      </Text>
                    </View>
                    {punch.latitude !== null && punch.longitude !== null ? (
                      <IconButton
                        tone="ghost"
                        label="Abrir no mapa"
                        icon={<MapPin size={20} color={colors.primary} />}
                        onPress={() => openMap(punch.latitude!, punch.longitude!, `${person?.name ?? ""} ${punch.timeLabel}`)}
                      />
                    ) : null}
                  </View>
                </View>
              ))}
            </Surface>
            {selected.filter((p) => p.hasPhoto).map((p) => (
              <View key={`photo-${p._id}`} style={{ gap: space.xs }}>
                <Text style={[type.label, { color: colors.text }]}>
                  Foto · {PUNCH_KIND[p.kind] ?? p.kind} {p.timeLabel}
                </Text>
                <PunchPhoto punchId={p._id} />
              </View>
            ))}
          </View>
        )}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.screen, paddingTop: space.md },
  content: { paddingHorizontal: space.screen, paddingTop: space.lg, paddingBottom: 96, gap: space.md },
  stats: { flexDirection: "row", gap: space.md },
  section: { paddingHorizontal: 0, paddingTop: space.sm, paddingBottom: space.xs },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 56 },
  border: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  punch: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
});
