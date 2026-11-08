import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Doc } from "@rlpapp/backend/convex/_generated/dataModel";
import { usePaginatedQuery, useQuery } from "convex/react";
import { useRouter, type Href } from "expo-router";
import {
  AlertTriangle,
  Building2,
  ClipboardCheck,
  FileText,
  Inbox,
  Info,
  Package,
  QrCode,
  ScanLine,
  ShieldAlert,
  Tag,
  Truck,
  Wallet,
} from "lucide-react-native";
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { AppButton, Banner, EmptyState, LoadingState, MetricStrip, SectionTitle, Surface, screenStyles } from "@/components/ui";
import { toBrtDateKey } from "@/lib/brt-date";
import { PROFILE_LABEL, type Profile } from "@/lib/profile";
import { colors, status, type } from "@/lib/theme";

import { HeroAction, HomeHeader, NeedList, NeedRow, ObraProgress, PontoHero } from "./parts";

type User = Doc<"users">;

function Scroll({ children, header }: { children: React.ReactNode; header: React.ReactNode }) {
  return (
    <ScrollView contentContainerStyle={[screenStyles.content, styles.content]} showsVerticalScrollIndicator={false}>
      {header}
      {children}
    </ScrollView>
  );
}

const icon = (Icon: typeof Inbox, color: string = colors.primary) => <Icon size={20} color={color} strokeWidth={2} />;

// ------------------------------------------------------------------ diretoria (S3)
export function DirectorHome({ user, right }: { user: User; right?: React.ReactNode }) {
  const router = useRouter();
  const [now] = useState(() => Date.now());
  const overview = useQuery(api.dashboard.getDirectorOverview, { now });

  return (
    <Scroll header={<HomeHeader name={user.name} right={right} />}>
      {overview === undefined ? (
        <LoadingState />
      ) : (
        <>
          <MetricStrip
            items={[
              { label: "Obras ativas", value: overview.kpis.activeProjects, hint: `${overview.kpis.newProjectsThisMonth} novas no mês` },
              { label: "Equipamentos", value: overview.kpis.totalEquipment, hint: `${overview.kpis.newEquipmentThisMonth} no mês` },
              { label: "Em aberto", value: overview.kpis.openWorkItems, hint: "itens de trabalho" },
            ]}
          />
          <SectionTitle title="Precisa de atenção" style={styles.section} />
          <NeedList>
            <NeedRow
              first
              icon={icon(AlertTriangle, status.warning)}
              title="Obras em atraso"
              subtitle="Previsão de entrega vencida"
              count={overview.criticalPending.overdueProjects}
              onPress={() => router.push("/(tabs)/obras")}
            />
            <NeedRow
              icon={icon(Building2)}
              title="Ambientes sem equipamento"
              subtitle="Estrutura cadastrada sem equipamento planejado"
              count={overview.criticalPending.environmentsWithoutEquipment}
              onPress={() => router.push("/(tabs)/obras")}
            />
          </NeedList>
          <SectionTitle title="Obras" action="Ver todas" onAction={() => router.push("/(tabs)/obras")} style={styles.section} />
          {overview.projects.length === 0 ? (
            <EmptyState title="Nenhuma obra ativa" description="As obras em andamento aparecem aqui." />
          ) : (
            overview.projects.slice(0, 5).map((p) => (
              <ObraProgress
                key={p._id}
                name={p.name}
                installed={p.installedItems}
                total={p.totalItems}
                late={p.overdue}
                onPress={() => router.push({ pathname: "/obra/[projectId]", params: { projectId: p._id } })}
              />
            ))
          )}
          {overview.recentActivity.length > 0 ? (
            <>
              <SectionTitle title="Atividade recente" style={styles.section} />
              <Surface padded={false}>
                {overview.recentActivity.slice(0, 6).map((a, i) => (
                  <View key={a._id} style={[styles.activity, i > 0 && styles.activityBorder]}>
                    <Text style={[type.bodySm, { color: colors.text }]} numberOfLines={2}>
                      <Text style={{ fontWeight: "600" }}>{a.userName}</Text> · {a.action} · {a.equipmentLabel}
                    </Text>
                    <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                      {a.projectName}
                    </Text>
                  </View>
                ))}
              </Surface>
            </>
          ) : null}
        </>
      )}
    </Scroll>
  );
}

// ------------------------------------------------------------------ engenharia (S5)
export function EngineeringHome({ user, right }: { user: User; right?: React.ReactNode }) {
  const router = useRouter();
  const approvals = useQuery(api.inventory.listPendingApprovals);
  const requests = useQuery(api.inventoryRequests.listOfficeRequests, { status: "pending" });
  const equipment = useQuery(api.equipment.list);
  const batches = useQuery(api.qrCodes.listBatchesWithoutProject);
  const projects = useQuery(api.projects.list, {});

  const errors = equipment?.filter((e) => e.status === "error").length ?? 0;
  const warnings = equipment?.filter((e) => e.status === "warning").length ?? 0;
  const mine = projects?.filter((p) => p.responsibleId === user._id && !p.archivedAt) ?? [];

  return (
    <Scroll header={<HomeHeader name={user.name} area={PROFILE_LABEL.engenharia} right={right} />}>
      <HeroAction
        icon={<ScanLine size={26} color={colors.onPrimary} />}
        title="Escanear etiqueta"
        subtitle="Abre o equipamento e o histórico"
        onPress={() => router.push("/scanner")}
      />
      <SectionTitle title="Precisa de você" style={styles.section} />
      <NeedList>
        <NeedRow
          first
          icon={icon(ShieldAlert, status.warning)}
          title="Aprovações de estoque"
          subtitle="Envio com material incompatível"
          count={approvals?.length ?? 0}
          onPress={() => router.push("/aprovacoes" as Href)}
        />
        <NeedRow
          icon={icon(Inbox)}
          title="Pedidos de material"
          subtitle="Pedidos das obras esperando aprovação"
          count={requests?.length ?? 0}
          onPress={() => router.push("/(tabs)/estoque/requisicoes" as Href)}
        />
        <NeedRow
          icon={icon(AlertTriangle, status.danger)}
          title="Equipamentos com erro"
          subtitle={`${errors} em erro e ${warnings} em atenção`}
          count={errors}
          onPress={() => router.push("/(tabs)/engenharia/equipamentos" as Href)}
        />
        <NeedRow
          icon={icon(QrCode)}
          title="Lotes sem obra"
          subtitle="Etiquetas geradas que ainda não têm obra"
          count={batches?.length ?? 0}
          onPress={() => router.push("/(tabs)/engenharia/qr-codes" as Href)}
        />
      </NeedList>
      <SectionTitle title="Suas obras" action="Ver todas" onAction={() => router.push("/(tabs)/obras")} style={styles.section} />
      {projects === undefined ? (
        <LoadingState />
      ) : mine.length === 0 ? (
        <EmptyState title="Nenhuma obra sua" description="As obras em que você é o responsável aparecem aqui." />
      ) : (
        mine.slice(0, 5).map((p) => (
          <ObraProgress
            key={p._id}
            name={p.name}
            installed={p.installedItems}
            total={p.totalItems}
            onPress={() => router.push({ pathname: "/obra/[projectId]", params: { projectId: p._id } })}
          />
        ))
      )}
    </Scroll>
  );
}

// ------------------------------------------------------------------ estoque (S4)
export function StockHome({ user, right }: { user: User; right?: React.ReactNode }) {
  const router = useRouter();
  const approved = useQuery(api.inventoryRequests.listOfficeRequests, { status: "approved" });
  const waiting = usePaginatedQuery(api.inventory.listDocuments, { status: "pending_approval" }, { initialNumItems: 50 });
  const health = useQuery(api.inventory.centralHealth, {});

  return (
    <Scroll header={<HomeHeader name={user.name} area={PROFILE_LABEL.estoque} right={right} />}>
      <SectionTitle title="Precisa de você" style={styles.section} />
      <NeedList>
        <NeedRow
          first
          icon={icon(Truck)}
          title="Pedidos para atender"
          subtitle="Aprovados pela engenharia, esperando envio"
          count={approved?.length ?? 0}
          onPress={() => router.push("/(tabs)/estoque/requisicoes" as Href)}
        />
        <NeedRow
          icon={icon(ShieldAlert, status.warning)}
          title="Esperando o engenheiro"
          subtitle="Envios com material incompatível"
          count={waiting.results.length}
          onPress={() => router.push("/(tabs)/estoque/movimentacoes?filtro=aguardando" as Href)}
        />
        <NeedRow
          icon={icon(Package, status.danger)}
          title="Estoque baixo"
          subtitle={health ? `${health.critical} críticos e ${health.reorder} para repor` : "Materiais abaixo do ponto de reposição"}
          count={health ? health.critical + health.reorder : undefined}
          onPress={() => router.push("/(tabs)/estoque?filtro=repor" as Href)}
        />
      </NeedList>
      <PontoHero onPress={() => router.push("/(tabs)/ponto")} />
    </Scroll>
  );
}

// ------------------------------------------------------------------ compras (S6)
export function PurchasingHome({ user, right }: { user: User; right?: React.ReactNode }) {
  const router = useRouter();
  const [now] = useState(() => Date.now());
  const stats = useQuery(api.priceEvents.dashboardStats, { now });
  const health = useQuery(api.inventory.centralHealth, {});

  return (
    <Scroll header={<HomeHeader name={user.name} area={PROFILE_LABEL.compras} right={right} />}>
      <SectionTitle title="Precisa de você" style={styles.section} />
      <NeedList>
        <NeedRow
          first
          icon={icon(Tag)}
          title="Fila de revisão"
          subtitle="Preços esperando revisão"
          count={stats?.unreviewedPrices ?? 0}
          onPress={() => router.push("/(tabs)/compras/fila-revisao" as Href)}
        />
        <NeedRow
          icon={icon(FileText)}
          title="Orçamentos para precificar"
          subtitle="Takeoffs com itens sem preço"
          count={stats?.takeoffsNeedingPricing ?? 0}
          onPress={() => router.push("/(tabs)/compras")}
        />
        <NeedRow
          icon={icon(ClipboardCheck, status.warning)}
          title="Preços desatualizados"
          subtitle="Materiais com último preço antigo"
          count={stats?.stalePrices ?? 0}
          onPress={() => router.push("/(tabs)/compras/eventos-preco" as Href)}
        />
        <NeedRow
          icon={icon(Package, status.danger)}
          title="Materiais para repor"
          subtitle={health ? `${health.critical} críticos e ${health.reorder} abaixo do ponto de reposição` : "Estoque central abaixo do ponto de reposição"}
          count={health ? health.critical + health.reorder : undefined}
          onPress={() => router.push("/(tabs)/estoque?filtro=repor" as Href)}
        />
      </NeedList>
      <SectionTitle title="Atalhos" style={styles.section} />
      <View style={styles.shortcuts}>
        <AppButton label="Materiais" variant="secondary" style={styles.shortcut} onPress={() => router.push("/(tabs)/compras/materiais" as Href)} />
        <AppButton label="Fornecedores" variant="secondary" style={styles.shortcut} onPress={() => router.push("/(tabs)/compras/fornecedores" as Href)} />
      </View>
    </Scroll>
  );
}

// ------------------------------------------------------------------ RH (S7)
export function HrHome({ user, right }: { user: User; right?: React.ReactNode }) {
  const router = useRouter();
  const [today] = useState(() => toBrtDateKey(Date.now()));
  const live = useQuery(api.timeClock.getLiveStatus, { date: today });
  const runs = useQuery(api.payroll.listRuns, { year: new Date().getFullYear() });
  const sync = useQuery(api.timeClock.getSyncStatus, {});
  const latest = runs ? [...runs].sort((a, b) => b.year - a.year || b.paymentMonth - a.paymentMonth)[0] : undefined;

  return (
    <Scroll header={<HomeHeader name={user.name} area={PROFILE_LABEL.rh} right={right} />}>
      <SectionTitle title="Ponto agora" action="Ver equipe" onAction={() => router.push("/(tabs)/rh/ponto" as Href)} style={styles.section} />
      {live === undefined ? (
        <LoadingState />
      ) : (
        <MetricStrip
          onPress={() => router.push("/(tabs)/rh/ponto" as Href)}
          items={[
            { label: "Na obra", value: live.summary.onSite, hint: `de ${live.summary.total} pessoas` },
            { label: "Almoço", value: live.summary.lunch },
            { label: "Ausentes", value: live.summary.absent, hint: live.summary.outsideFence ? `${live.summary.outsideFence} fora da cerca` : null },
          ]}
        />
      )}
      {sync?.lastSyncStatus === "error" ? (
        <Banner
          tone="danger"
          icon={<AlertTriangle size={20} color={status.danger} />}
          title="Ponto RHID sem sincronizar"
          detail={sync.lastSyncError ?? "A última tentativa falhou."}
          actionLabel="Abrir"
          onAction={() => router.push("/(tabs)/rh/ponto" as Href)}
        />
      ) : null}
      <SectionTitle title="Folha" style={styles.section} />
      <NeedList>
        <NeedRow
          first
          icon={icon(Wallet)}
          title={latest ? `Folha de ${latest.label}` : "Folha do mês"}
          subtitle={latest ? (latest.status === "closed" ? "Fechada" : "Em aberto") : "Ainda não criada"}
          onPress={() => router.push("/(tabs)/rh/folha" as Href)}
        />
      </NeedList>
    </Scroll>
  );
}

// ------------------------------------------------------------------ sem área (S8)
export function NoAreaHome({ user, right }: { user: User; right?: React.ReactNode }) {
  const router = useRouter();
  return (
    <Scroll header={<HomeHeader name={user.name} right={right} />}>
      <Banner
        tone="info"
        icon={<Info size={20} color={status.info} />}
        title="Seu usuário ainda não tem área"
        detail="Peça a um administrador para definir sua área (Engenharia, Compras, Estoque ou RH). Enquanto isso, você pode marcar o ponto."
      />
      <PontoHero onPress={() => router.push("/(tabs)/ponto")} />
    </Scroll>
  );
}

export function homeFor(profile: Profile) {
  switch (profile) {
    case "diretoria":
      return DirectorHome;
    case "engenharia":
      return EngineeringHome;
    case "estoque":
      return StockHome;
    case "compras":
      return PurchasingHome;
    case "rh":
      return HrHome;
    default:
      return NoAreaHome;
  }
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingBottom: 32 },
  section: { paddingHorizontal: 2, paddingTop: 8, paddingBottom: 0 },
  activity: { paddingHorizontal: 16, paddingVertical: 12, gap: 2 },
  activityBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  shortcuts: { flexDirection: "row", gap: 10 },
  shortcut: { flex: 1 },
});
