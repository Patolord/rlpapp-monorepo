import { api } from "@rlpapp/backend/convex/_generated/api";
import { formatCurrency } from "@rlpapp/shared";
import { useQuery } from "convex/react";
import { Building2, ChevronLeft, ChevronRight, Clock, MapPinOff, RefreshCw } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { LIVE_STATUS, MONTH_NAMES, PUNCH_KIND } from "@/components/rh/labels";
import { Banner, Chips, EmptyState, IconButton, LoadingState, Pill, SectionTitle, StatTile, Surface } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { colors, space, type } from "@/lib/theme";

type Tab = "hoje" | "mes";

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftMonth(year: number, month: number, delta: number) {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/** Ponto eletrônico (RHID): situação ao vivo de hoje e resumo mensal. */
export default function PontoScreen() {
  const [tab, setTab] = useState<Tab>("hoje");
  const [today, setToday] = useState(() => dateKey(new Date()));
  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });

  // Mantém a data de hoje atualizada se a tela ficar aberta na virada do dia.
  useEffect(() => {
    const id = setInterval(() => setToday(dateKey(new Date())), 60_000);
    return () => clearInterval(id);
  }, []);

  const sync = useQuery(api.timeClock.getSyncStatus, {});
  const live = useQuery(api.timeClock.getLiveStatus, tab === "hoje" ? { date: today } : "skip");
  const month = useQuery(api.timeClock.getMonthStats, tab === "mes" ? { year: period.year, month: period.month } : "skip");

  const syncBanner =
    sync && !sync.configured ? (
      <Banner tone="warning" title="Integração com o RHID não configurada" detail="Configure no web em RH › Ponto para sincronizar as marcações." />
    ) : sync?.lastSyncStatus === "error" ? (
      <Banner tone="danger" title="Última sincronização falhou" detail={sync.lastSyncError ?? undefined} />
    ) : sync?.lastSyncFinishedAt ? (
      <Banner tone="neutral" icon={<RefreshCw size={16} color={colors.textSecondary} />} title={`Sincronizado ${formatDateTime(sync.lastSyncFinishedAt)}`} detail={sync.lastSyncPunches != null ? `${sync.lastSyncPunches} marcações · ${sync.lastSyncPeople ?? 0} pessoas` : undefined} />
    ) : null;

  return (
    <View style={{ flex: 1 }}>
      <Chips<Tab>
        active={tab}
        onChange={setTab}
        items={[
          { key: "hoje", label: "Hoje" },
          { key: "mes", label: "Mês" },
        ]}
      />
      {tab === "hoje" ? (
        live === undefined ? (
          <LoadingState />
        ) : (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {syncBanner}
            <View style={styles.stats}>
              <StatTile label="Na obra" value={live.summary.onSite} tone="success" hint={`de ${live.summary.total} pessoas`} />
              <StatTile label="Almoço" value={live.summary.lunch} tone="info" hint={`${live.summary.left} já saíram`} />
              <StatTile label="Ausentes" value={live.summary.absent} tone={live.summary.absent > 0 ? "warning" : "neutral"} hint={live.summary.outsideFence > 0 ? `${live.summary.outsideFence} fora da cerca` : "todos na cerca"} />
            </View>

            {live.worksites.length > 0 ? (
              <>
                <SectionTitle title="Por obra" style={styles.section} />
                {live.worksites.map((w) => (
                  <Surface key={w.rhidGeofenceId} style={{ gap: space.sm }}>
                    <View style={styles.rowBetween}>
                      <View style={styles.wsIcon}>
                        <Building2 size={18} color={colors.primary} strokeWidth={1.8} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                          {w.projectName ?? w.name}
                        </Text>
                        {w.projectName ? <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>{w.name}</Text> : null}
                      </View>
                      <Pill label={`${w.onSite} na obra`} tone={w.onSite > 0 ? "success" : "neutral"} />
                      {w.lunch > 0 ? <Pill label={`${w.lunch} almoço`} tone="info" /> : null}
                    </View>
                    {w.people.length > 0 ? (
                      <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={3}>
                        {w.people.map((p) => p.name).join(" · ")}
                      </Text>
                    ) : null}
                  </Surface>
                ))}
              </>
            ) : null}

            <SectionTitle title="Pessoas" style={styles.section} />
            {live.people.length === 0 ? (
              <EmptyState icon={<Clock size={30} color={colors.primary} strokeWidth={1.8} />} title="Sem marcações hoje" description="As marcações aparecem após a sincronização com o RHID." />
            ) : (
              <Surface padded={false}>
                {live.people.map((p, index) => {
                  const st = LIVE_STATUS[p.status] ?? { label: p.status, tone: "neutral" as const };
                  return (
                    <View key={p.rhidPersonId} style={[styles.person, index > 0 && styles.personBorder]}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                          {p.employee?.name ?? p.name}
                        </Text>
                        <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
                          {[p.worksiteName, p.lastKind ? `${PUNCH_KIND[p.lastKind] ?? p.lastKind} ${p.lastTimeLabel ?? ""}`.trim() : null, p.employee?.jobTitle].filter(Boolean).join(" · ") || "Sem marcação"}
                        </Text>
                      </View>
                      {!p.locationExact && p.status !== "absent" ? <MapPinOff size={16} color={colors.warning} /> : null}
                      <Pill label={st.label} tone={st.tone} />
                    </View>
                  );
                })}
              </Surface>
            )}
          </ScrollView>
        )
      ) : (
        <>
          <View style={styles.periodBar}>
            <IconButton label="Mês anterior" icon={<ChevronLeft size={20} color={colors.text} strokeWidth={2} />} onPress={() => setPeriod((p) => shiftMonth(p.year, p.month, -1))} />
            <Text style={[type.heading, { color: colors.text, flex: 1, textAlign: "center" }]}>
              {MONTH_NAMES[period.month - 1]} {period.year}
            </Text>
            <IconButton label="Próximo mês" icon={<ChevronRight size={20} color={colors.text} strokeWidth={2} />} onPress={() => setPeriod((p) => shiftMonth(p.year, p.month, 1))} />
          </View>
          {month === undefined ? (
            <LoadingState />
          ) : (
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <View style={styles.stats}>
                <StatTile label="Diárias" value={month.totalManDays} hint={`${month.uniquePeople} pessoa${month.uniquePeople === 1 ? "" : "s"} · ${month.uniqueWorksites} obra${month.uniqueWorksites === 1 ? "" : "s"}`} />
                <StatTile label="Custo estimado" value={formatCurrency(month.totalManDays * month.manDayCostCents)} tone="info" hint={`${formatCurrency(month.manDayCostCents)} por diária`} />
              </View>

              <SectionTitle title="Por obra" style={styles.section} />
              {month.byWorksite.length === 0 ? (
                <EmptyState title="Sem presenças no mês" />
              ) : (
                month.byWorksite.map((w) => (
                  <Surface key={w.rhidGeofenceId ?? "none"} style={{ gap: space.sm }}>
                    <View style={styles.rowBetween}>
                      <Text style={[type.bodyStrong, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                        {w.projectName ?? w.worksiteName ?? "Fora de obra"}
                      </Text>
                      <Pill label={`${w.totalManDays} diária${w.totalManDays === 1 ? "" : "s"}`} tone="info" />
                    </View>
                    <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={3}>
                      {w.people.map((p) => `${p.personName} (${p.days})`).join(" · ")}
                    </Text>
                  </Surface>
                ))
              )}

              <SectionTitle title="Por pessoa" style={styles.section} />
              {month.byPerson.length > 0 ? (
                <Surface padded={false}>
                  {month.byPerson.map((p, index) => (
                    <View key={p.rhidPersonId} style={[styles.person, index > 0 && styles.personBorder]}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                          {p.employee?.name ?? p.personName}
                        </Text>
                        <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={2}>
                          {p.worksites.map((w) => `${w.worksiteName ?? "Fora de obra"} ${w.days}`).join(" · ")}
                        </Text>
                      </View>
                      <Text style={[type.bodyStrong, { color: colors.text }]}>{p.totalDays}d</Text>
                    </View>
                  ))}
                </Surface>
              ) : null}
            </ScrollView>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.screen, paddingTop: space.lg, paddingBottom: space.xxl * 2, gap: space.md },
  stats: { flexDirection: "row", gap: space.md },
  section: { paddingHorizontal: 0, paddingTop: space.sm, paddingBottom: space.xs },
  rowBetween: { flexDirection: "row", alignItems: "center", gap: space.sm },
  wsIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  person: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingVertical: 12 },
  personBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  periodBar: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.screen, paddingTop: space.md },
});
