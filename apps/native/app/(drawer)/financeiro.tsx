import { api } from "@rlpapp/backend/convex/_generated/api";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import {
  DollarSign,
  AlertTriangle,
  Clock,
  CheckCircle2,
  ArrowUpFromLine,
  ArrowDownToLine,
  Tag,
  Landmark,
  ChevronRight,
  CalendarClock,
  TrendingDown,
  TrendingUp,
  UserCheck,
  GitCompareArrows,
  BarChart3,
  Lock,
} from "lucide-react-native";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Link, useRouter } from "expo-router";

import { Container } from "@/components/container";
import { Button, ButtonText } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function FinanceiroScreen() {
  return (
    <Container className="px-5 pt-4 pb-4">
      <Authenticated>
        <DashboardContent />
      </Authenticated>
      <Unauthenticated>
        <Card className="p-6 items-center">
          <Lock size={48} color="#888" />
          <Text className="text-foreground font-medium mt-4">Acesso Restrito</Text>
          <Text className="text-muted-foreground text-sm text-center mt-2">Faça login para acessar</Text>
          <Link href="/(auth)/sign-in" asChild>
            <Button className="mt-4"><ButtonText>Entrar</ButtonText></Button>
          </Link>
        </Card>
      </Unauthenticated>
      <AuthLoading>
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" /></View>
      </AuthLoading>
    </Container>
  );
}

function formatCurrency(valueInCents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valueInCents / 100);
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(timestamp);
}

function DashboardContent() {
  const router = useRouter();
  const pagarSummary = useQuery(api.contasPagar.getDashboardSummary);
  const pagarVencidas = useQuery(api.contasPagar.getVencidas);
  const pagarProximas = useQuery(api.contasPagar.getProximasVencer);
  const receberSummary = useQuery(api.contasReceber.getDashboardSummary);
  const receberInadimplentes = useQuery(api.contasReceber.getInadimplentes);
  const receberProximas = useQuery(api.contasReceber.getProximasVencer);
  const conciliacaoSummary = useQuery(api.conciliacoes.getDashboardSummary, {});

  if (!pagarSummary || !receberSummary) {
    return (
      <View className="flex-1 items-center justify-center py-24">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const pagarVencidasList = pagarVencidas ?? [];
  const pagarProximasList = pagarProximas ?? [];
  const receberInadimList = receberInadimplentes ?? [];
  const receberProximasList = receberProximas ?? [];
  const conciliacao = conciliacaoSummary ?? {
    totalTransacoes: 0,
    totalConciliadas: 0,
    totalPendentes: 0,
    totalIgnoradas: 0,
    valorConciliado: 0,
    valorPendente: 0,
    percentualConciliado: 0,
  };

  const quickActions = [
    { label: "Contas a Pagar", icon: ArrowUpFromLine, route: "/(drawer)/contas-pagar" as const, bg: "bg-red-500" },
    { label: "Contas a Receber", icon: ArrowDownToLine, route: "/(drawer)/contas-receber" as const, bg: "bg-emerald-500" },
    { label: "Clientes", icon: UserCheck, route: "/(drawer)/clientes" as const, bg: "bg-sky-500" },
    { label: "Categorias", icon: Tag, route: "/(drawer)/categorias" as const, bg: "bg-amber-500" },
    { label: "Contas Bancárias", icon: Landmark, route: "/(drawer)/contas-bancarias" as const, bg: "bg-indigo-500" },
    { label: "Conciliação", icon: GitCompareArrows, route: "/(drawer)/conciliacao" as const, bg: "bg-violet-500" },
    { label: "Relatórios", icon: BarChart3, route: "/(drawer)/relatorios" as const, bg: "bg-blue-500" },
  ];

  return (
    <View className="gap-6">
      <View>
        <Text className="text-2xl font-bold text-foreground">Dashboard Financeiro</Text>
        <Text className="text-muted-foreground text-sm">Visão geral de contas a pagar e receber</Text>
      </View>

      {/* Quick Actions */}
      <View className="flex-row flex-wrap gap-3">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <Pressable
              key={action.label}
              onPress={() => router.push(action.route)}
              className="rounded-2xl bg-card p-4 items-center justify-center"
              style={{ width: "30%", minHeight: 80 }}
            >
              <View className={`w-10 h-10 rounded-xl items-center justify-center ${action.bg}`}>
                <Icon size={18} color="#fff" />
              </View>
              <Text className="text-foreground text-xs font-medium mt-2 text-center">{action.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Contas a Pagar */}
      <View className="gap-4">
        <View className="flex-row items-center gap-3">
          <View className="w-8 h-8 items-center justify-center rounded-lg bg-red-500/10">
            <ArrowUpFromLine size={16} color="#dc2626" />
          </View>
          <Text className="text-xl font-semibold text-foreground">Contas a Pagar</Text>
        </View>

        <View className="flex-row flex-wrap gap-3">
          <MetricCard
            title="Total a Pagar"
            value={formatCurrency(pagarSummary.totalPendente)}
            subtitle={`${pagarSummary.countPendente} pendentes`}
            accentColor="#3b82f6"
            icon={<DollarSign size={20} color="#fff" />}
          />
          <MetricCard
            title="Vencido"
            value={formatCurrency(pagarSummary.totalVencido)}
            subtitle={`${pagarSummary.countVencido} vencidas`}
            accentColor="#ef4444"
            icon={<AlertTriangle size={20} color="#fff" />}
            valueColor={pagarSummary.countVencido > 0 ? "#ef4444" : undefined}
          />
          <MetricCard
            title="Venc. Semana"
            value={String(pagarSummary.countVencendoSemana)}
            subtitle="próximos 7 dias"
            accentColor="#f59e0b"
            icon={<Clock size={20} color="#fff" />}
            valueColor={pagarSummary.countVencendoSemana > 0 ? "#d97706" : undefined}
          />
          <MetricCard
            title="Pago Mês"
            value={formatCurrency(pagarSummary.totalPagoMes)}
            subtitle={`${pagarSummary.countPago} pagamentos`}
            accentColor="#10b981"
            icon={<CheckCircle2 size={20} color="#fff" />}
          />
        </View>

        <ListCard
          title="Contas Vencidas"
          description="Requerem ação imediata"
          count={pagarVencidasList.length}
          accentColor="#ef4444"
          icon={<AlertTriangle size={16} color="#fff" />}
          badgeVariant={pagarVencidasList.length > 0 ? "destructive" : "secondary"}
          onSeeAll={() => router.push("/(drawer)/contas-pagar")}
          emptyText="Nenhuma conta vencida"
          items={pagarVencidasList.map((c) => ({
            id: c._id,
            title: c.descricao,
            subtitle: c.fornecedor?.name ?? "Sem fornecedor",
            value: formatCurrency(c.valor),
            meta: `Venceu ${formatDate(c.dataVencimento)}`,
            iconEl: <TrendingDown size={16} color="#ef4444" />,
            valueColor: "#dc2626",
          }))}
        />
        <ListCard
          title="Próximas a Vencer"
          description="Nos próximos 7 dias"
          count={pagarProximasList.length}
          accentColor="#f59e0b"
          icon={<CalendarClock size={16} color="#fff" />}
          badgeVariant={pagarProximasList.length > 0 ? "warning" : "secondary"}
          onSeeAll={() => router.push("/(drawer)/contas-pagar")}
          emptyText="Nenhuma conta vencendo esta semana"
          items={pagarProximasList.map((c) => ({
            id: c._id,
            title: c.descricao,
            subtitle: `${c.fornecedor?.name ?? "Sem fornecedor"}${c.categoria ? ` • ${c.categoria.nome}` : ""}`,
            value: formatCurrency(c.valor),
            meta: `Vence ${formatDate(c.dataVencimento)}`,
            iconEl: <Clock size={16} color="#f59e0b" />,
            valueColor: undefined,
          }))}
        />
      </View>

      {/* Contas a Receber */}
      <View className="gap-4">
        <View className="flex-row items-center gap-3">
          <View className="w-8 h-8 items-center justify-center rounded-lg bg-emerald-500/10">
            <ArrowDownToLine size={16} color="#10b981" />
          </View>
          <Text className="text-xl font-semibold text-foreground">Contas a Receber</Text>
        </View>

        <View className="flex-row flex-wrap gap-3">
          <MetricCard
            title="Total a Receber"
            value={formatCurrency(receberSummary.totalAReceber)}
            subtitle={`${receberSummary.countEmitido} emitidas`}
            accentColor="#06b6d4"
            icon={<ArrowDownToLine size={20} color="#fff" />}
          />
          <MetricCard
            title="Inadimplentes"
            value={formatCurrency(receberSummary.totalVencido)}
            subtitle={`${receberSummary.countInadimplentes} vencidas`}
            accentColor="#f97316"
            icon={<AlertTriangle size={20} color="#fff" />}
            valueColor={receberSummary.countInadimplentes > 0 ? "#f97316" : undefined}
          />
          <MetricCard
            title="Venc. Semana"
            value={String(receberSummary.countVencendoSemana)}
            subtitle="próximos 7 dias"
            accentColor="#8b5cf6"
            icon={<CalendarClock size={20} color="#fff" />}
            valueColor={receberSummary.countVencendoSemana > 0 ? "#7c3aed" : undefined}
          />
          <MetricCard
            title="Recebido Mês"
            value={formatCurrency(receberSummary.totalRecebidoMes)}
            subtitle={`${receberSummary.countRecebido} recebimentos`}
            accentColor="#14b8a6"
            icon={<CheckCircle2 size={20} color="#fff" />}
          />
        </View>

        <ListCard
          title="Inadimplentes"
          description="Clientes com pagamentos atrasados"
          count={receberInadimList.length}
          accentColor="#f97316"
          icon={<AlertTriangle size={16} color="#fff" />}
          badgeVariant={receberInadimList.length > 0 ? "destructive" : "secondary"}
          onSeeAll={() => router.push("/(drawer)/contas-receber")}
          emptyText="Nenhum inadimplente"
          items={receberInadimList.map((c) => ({
            id: c._id,
            title: c.descricao,
            subtitle: c.cliente?.nome ?? "Sem cliente",
            value: formatCurrency(c.valor - c.valorRecebido),
            meta: `Venceu ${formatDate(c.dataVencimento)}`,
            iconEl: <TrendingUp size={16} color="#f97316" />,
            valueColor: "#ea580c",
          }))}
        />
        <ListCard
          title="Próximas a Vencer"
          description="Recebíveis nos próximos 7 dias"
          count={receberProximasList.length}
          accentColor="#8b5cf6"
          icon={<CalendarClock size={16} color="#fff" />}
          badgeVariant={receberProximasList.length > 0 ? "warning" : "secondary"}
          onSeeAll={() => router.push("/(drawer)/contas-receber")}
          emptyText="Nenhuma conta vencendo esta semana"
          items={receberProximasList.map((c) => ({
            id: c._id,
            title: c.descricao,
            subtitle: `${c.cliente?.nome ?? "Sem cliente"}${c.categoria ? ` • ${c.categoria.nome}` : ""}`,
            value: formatCurrency(c.valor - c.valorRecebido),
            meta: `Vence ${formatDate(c.dataVencimento)}`,
            iconEl: <Clock size={16} color="#8b5cf6" />,
            valueColor: undefined,
          }))}
        />
      </View>

      {/* Conciliação Bancária */}
      <View className="gap-4">
        <View className="flex-row items-center gap-3">
          <View className="w-8 h-8 items-center justify-center rounded-lg bg-violet-500/10">
            <GitCompareArrows size={16} color="#8b5cf6" />
          </View>
          <Text className="text-xl font-semibold text-foreground">Conciliação Bancária</Text>
        </View>

        <View className="flex-row flex-wrap gap-3">
          <MetricCard
            title="Total Transações"
            value={String(conciliacao.totalTransacoes)}
            subtitle={`${conciliacao.totalConciliadas} conciliadas`}
            accentColor="#8b5cf6"
            icon={<GitCompareArrows size={20} color="#fff" />}
          />
          <MetricCard
            title="Conciliadas"
            value={`${conciliacao.percentualConciliado}%`}
            subtitle={`${conciliacao.totalConciliadas} de ${conciliacao.totalTransacoes}`}
            accentColor="#10b981"
            icon={<CheckCircle2 size={20} color="#fff" />}
            valueColor={conciliacao.percentualConciliado >= 80 ? "#10b981" : conciliacao.percentualConciliado >= 50 ? "#d97706" : "#ef4444"}
          />
          <MetricCard
            title="Pendentes"
            value={String(conciliacao.totalPendentes)}
            subtitle={formatCurrency(conciliacao.valorPendente)}
            accentColor="#f59e0b"
            icon={<Clock size={20} color="#fff" />}
            valueColor={conciliacao.totalPendentes > 0 ? "#d97706" : undefined}
          />
          <MetricCard
            title="Valor Conciliado"
            value={formatCurrency(conciliacao.valorConciliado)}
            subtitle="total verificado"
            accentColor="#3b82f6"
            icon={<DollarSign size={20} color="#fff" />}
          />
        </View>
      </View>
    </View>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  accentColor,
  icon,
  valueColor,
}: {
  title: string;
  value: string;
  subtitle: string;
  accentColor: string;
  icon: React.ReactNode;
  valueColor?: string;
}) {
  return (
    <Card className="rounded-2xl overflow-hidden" style={{ width: "48%" }}>
      <View style={{ height: 4, backgroundColor: accentColor }} />
      <CardContent className="p-4">
        <View className="flex-row items-start justify-between">
          <View className="flex-1">
            <Text className="text-xs text-muted-foreground">{title}</Text>
            <Text
              className="text-lg font-bold mt-1"
              style={{ color: valueColor ?? undefined }}
              numberOfLines={1}
            >
              {value}
            </Text>
            <Text className="text-xs text-muted-foreground mt-1">{subtitle}</Text>
          </View>
          <View
            className="w-10 h-10 rounded-xl items-center justify-center"
            style={{ backgroundColor: accentColor }}
          >
            {icon}
          </View>
        </View>
      </CardContent>
    </Card>
  );
}

function ListCard({
  title,
  description,
  count,
  accentColor,
  icon,
  badgeVariant,
  onSeeAll,
  emptyText,
  items,
}: {
  title: string;
  description: string;
  count: number;
  accentColor: string;
  icon: React.ReactNode;
  badgeVariant: "destructive" | "warning" | "secondary";
  onSeeAll: () => void;
  emptyText: string;
  items: Array<{
    id: string;
    title: string;
    subtitle: string;
    value: string;
    meta: string;
    iconEl: React.ReactNode;
    valueColor?: string;
  }>;
}) {
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <View className="flex-row items-start justify-between">
          <View className="flex-row items-start gap-3 flex-1">
            <View
              className="w-9 h-9 rounded-full items-center justify-center mt-0.5"
              style={{ backgroundColor: accentColor }}
            >
              {icon}
            </View>
            <View className="flex-1">
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </View>
          </View>
          <Badge variant={badgeVariant}>{String(count)}</Badge>
        </View>
      </CardHeader>
      <CardContent className="gap-3">
        {items.length > 0 ? (
          items.map((item) => (
            <View key={item.id} className="rounded-xl border border-border p-3">
              <View className="flex-row items-start justify-between gap-2">
                <View className="flex-row items-start gap-2 flex-1">
                  <View className="w-8 h-8 rounded-lg items-center justify-center bg-muted mt-0.5">
                    {item.iconEl}
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>{item.title}</Text>
                    <Text className="text-xs text-muted-foreground mt-0.5">{item.subtitle}</Text>
                  </View>
                </View>
                <View className="items-end">
                  <Text className="text-sm font-bold" style={{ color: item.valueColor }}>{item.value}</Text>
                  <Text className="text-xs text-muted-foreground mt-0.5">{item.meta}</Text>
                </View>
              </View>
            </View>
          ))
        ) : (
          <View className="rounded-xl border border-dashed border-border p-6 items-center">
            <Text className="text-sm text-muted-foreground">{emptyText}</Text>
          </View>
        )}
      </CardContent>
      <Pressable onPress={onSeeAll} className="flex-row items-center justify-center gap-1 py-3">
        <Text className="text-sm font-medium text-primary">Ver tudo</Text>
        <ChevronRight size={16} color="#3b82f6" />
      </Pressable>
    </Card>
  );
}
