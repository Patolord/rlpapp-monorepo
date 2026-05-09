import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute, Link } from "@tanstack/react-router";
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
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConvexUnauthRedirect } from "@/components/convex-unauth-redirect";

export const Route = createFileRoute("/financeiro/")({
  component: FinanceiroDashboard,
});

function FinanceiroDashboard() {
  return (
    <>
      <Authenticated>
        <DashboardContent />
      </Authenticated>
      <Unauthenticated>
        <ConvexUnauthRedirect />
      </Unauthenticated>
      <AuthLoading>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </AuthLoading>
    </>
  );
}

function DashboardContent() {
  const pagarSummary = useQuery(api.contasPagar.getDashboardSummary);
  const pagarVencidas = useQuery(api.contasPagar.getVencidas);
  const pagarProximas = useQuery(api.contasPagar.getProximasVencer);

  const receberSummary = useQuery(api.contasReceber.getDashboardSummary);
  const receberInadimplentes = useQuery(api.contasReceber.getInadimplentes);
  const receberProximas = useQuery(api.contasReceber.getProximasVencer);

  const conciliacaoSummary = useQuery(api.conciliacoes.getDashboardSummary, {});

  if (!pagarSummary || !receberSummary) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Carregando dashboard...</p>
      </div>
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

  return (
    <div className="min-h-full bg-[#f7f7f6] p-6">
      <div className="mx-auto max-w-7xl space-y-8">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">Dashboard Financeiro</h1>
          <p className="text-muted-foreground">Visão geral de contas a pagar e receber</p>
        </div>

        {/* Quick Actions */}
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
          <Link to="/financeiro/contas-pagar">
            <QuickActionButton
              label="Contas a Pagar"
              icon={<ArrowUpFromLine className="h-4 w-4" />}
              className="bg-red-500 text-white hover:bg-red-600"
            />
          </Link>
          <Link to="/financeiro/contas-receber">
            <QuickActionButton
              label="Contas a Receber"
              icon={<ArrowDownToLine className="h-4 w-4" />}
              className="bg-emerald-500 text-white hover:bg-emerald-600"
            />
          </Link>
          <Link to="/financeiro/conciliacao">
            <QuickActionButton
              label="Conciliação"
              icon={<GitCompareArrows className="h-4 w-4" />}
              className="bg-violet-500 text-white hover:bg-violet-600"
            />
          </Link>
          <Link to="/financeiro/relatorios">
            <QuickActionButton
              label="Relatórios"
              icon={<BarChart3 className="h-4 w-4" />}
              className="bg-blue-500 text-white hover:bg-blue-600"
            />
          </Link>
          <Link to="/financeiro/clientes">
            <QuickActionButton
              label="Clientes"
              icon={<UserCheck className="h-4 w-4" />}
            />
          </Link>
          <Link to="/financeiro/categorias">
            <QuickActionButton
              label="Categorias"
              icon={<Tag className="h-4 w-4" />}
            />
          </Link>
          <Link to="/financeiro/contas-bancarias">
            <QuickActionButton
              label="Contas Bancárias"
              icon={<Landmark className="h-4 w-4" />}
            />
          </Link>
        </div>

        {/* Contas a Pagar */}
        <section className="space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10">
              <ArrowUpFromLine className="h-4 w-4 text-red-600" />
            </div>
            <h2 className="text-2xl font-semibold text-foreground">Contas a Pagar</h2>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Total a Pagar"
              value={formatCurrency(pagarSummary.totalPendente)}
              subtitle={`${pagarSummary.countPendente} contas pendentes`}
              icon={<DollarSign className="h-5 w-5 text-white" />}
              accentClass="bg-blue-500"
            />
            <MetricCard
              title="Vencido"
              value={formatCurrency(pagarSummary.totalVencido)}
              subtitle={`${pagarSummary.countVencido} contas vencidas`}
              icon={<AlertTriangle className="h-5 w-5 text-white" />}
              accentClass="bg-red-500"
              valueClassName={pagarSummary.countVencido > 0 ? "text-red-500" : undefined}
              subtitleClassName={pagarSummary.countVencido > 0 ? "text-red-400" : undefined}
            />
            <MetricCard
              title="Vencendo esta Semana"
              value={String(pagarSummary.countVencendoSemana)}
              subtitle="próximos 7 dias"
              icon={<Clock className="h-5 w-5 text-white" />}
              accentClass="bg-amber-500"
              valueClassName={pagarSummary.countVencendoSemana > 0 ? "text-amber-600" : undefined}
            />
            <MetricCard
              title="Pago este Mês"
              value={formatCurrency(pagarSummary.totalPagoMes)}
              subtitle={`${pagarSummary.countPago} pagamentos realizados`}
              icon={<CheckCircle2 className="h-5 w-5 text-white" />}
              accentClass="bg-emerald-500"
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <ListCard
              title="Contas Vencidas"
              description="Requerem ação imediata"
              count={pagarVencidasList.length}
              iconBg="bg-red-500"
              icon={<AlertTriangle className="h-4 w-4 text-white" />}
              badgeVariant={pagarVencidasList.length > 0 ? "destructive" : "secondary"}
              linkTo="/financeiro/contas-pagar"
              linkLabel="Ver contas a pagar"
              emptyText="Nenhuma conta vencida"
              items={pagarVencidasList.map((c) => ({
                id: c._id,
                title: c.descricao,
                subtitle: c.fornecedor?.name ?? "Sem fornecedor",
                value: formatCurrency(c.valor),
                meta: `Venceu ${formatDate(c.dataVencimento)}`,
                itemIcon: <TrendingDown className="h-4 w-4 text-red-500" />,
                itemIconBg: "bg-red-100",
                borderClass: "border-red-100 bg-red-50/80",
                valueClass: "text-red-600",
                metaClass: "text-red-400",
              }))}
            />
            <ListCard
              title="Próximas a Vencer"
              description="Nos próximos 7 dias"
              count={pagarProximasList.length}
              iconBg="bg-amber-500"
              icon={<CalendarClock className="h-4 w-4 text-white" />}
              badgeVariant={pagarProximasList.length > 0 ? "warning" : "secondary"}
              linkTo="/financeiro/contas-pagar"
              linkLabel="Ver contas a pagar"
              emptyText="Nenhuma conta vencendo esta semana"
              items={pagarProximasList.map((c) => ({
                id: c._id,
                title: c.descricao,
                subtitle: `${c.fornecedor?.name ?? "Sem fornecedor"}${c.categoria ? ` • ${c.categoria.nome}` : ""}`,
                value: formatCurrency(c.valor),
                meta: `Vence ${formatDate(c.dataVencimento)}`,
                itemIcon: <Clock className="h-4 w-4 text-amber-500" />,
                itemIconBg: "bg-amber-50",
                borderClass: "border-slate-100 bg-slate-50/80",
                valueClass: "text-foreground",
                metaClass: "text-amber-600",
              }))}
            />
          </div>
        </section>

        {/* Contas a Receber */}
        <section className="space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
              <ArrowDownToLine className="h-4 w-4 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-semibold text-foreground">Contas a Receber</h2>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Total a Receber"
              value={formatCurrency(receberSummary.totalAReceber)}
              subtitle={`${receberSummary.countEmitido} contas emitidas`}
              icon={<ArrowDownToLine className="h-5 w-5 text-white" />}
              accentClass="bg-cyan-500"
            />
            <MetricCard
              title="Inadimplentes"
              value={formatCurrency(receberSummary.totalVencido)}
              subtitle={`${receberSummary.countInadimplentes} contas vencidas`}
              icon={<AlertTriangle className="h-5 w-5 text-white" />}
              accentClass="bg-orange-500"
              valueClassName={receberSummary.countInadimplentes > 0 ? "text-orange-500" : undefined}
              subtitleClassName={receberSummary.countInadimplentes > 0 ? "text-orange-400" : undefined}
            />
            <MetricCard
              title="Vencendo esta Semana"
              value={String(receberSummary.countVencendoSemana)}
              subtitle="próximos 7 dias"
              icon={<CalendarClock className="h-5 w-5 text-white" />}
              accentClass="bg-violet-500"
              valueClassName={receberSummary.countVencendoSemana > 0 ? "text-violet-600" : undefined}
            />
            <MetricCard
              title="Recebido este Mês"
              value={formatCurrency(receberSummary.totalRecebidoMes)}
              subtitle={`${receberSummary.countRecebido} recebimentos`}
              icon={<CheckCircle2 className="h-5 w-5 text-white" />}
              accentClass="bg-teal-500"
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <ListCard
              title="Inadimplentes"
              description="Clientes com pagamentos atrasados"
              count={receberInadimList.length}
              iconBg="bg-orange-500"
              icon={<AlertTriangle className="h-4 w-4 text-white" />}
              badgeVariant={receberInadimList.length > 0 ? "destructive" : "secondary"}
              linkTo="/financeiro/contas-receber"
              linkLabel="Ver contas a receber"
              emptyText="Nenhum inadimplente"
              items={receberInadimList.map((c) => ({
                id: c._id,
                title: c.descricao,
                subtitle: c.cliente?.nome ?? "Sem cliente",
                value: formatCurrency(c.valor - c.valorRecebido),
                meta: `Venceu ${formatDate(c.dataVencimento)}`,
                itemIcon: <TrendingUp className="h-4 w-4 text-orange-500" />,
                itemIconBg: "bg-orange-100",
                borderClass: "border-orange-100 bg-orange-50/80",
                valueClass: "text-orange-600",
                metaClass: "text-orange-400",
              }))}
            />
            <ListCard
              title="Próximas a Vencer"
              description="Recebíveis nos próximos 7 dias"
              count={receberProximasList.length}
              iconBg="bg-violet-500"
              icon={<CalendarClock className="h-4 w-4 text-white" />}
              badgeVariant={receberProximasList.length > 0 ? "warning" : "secondary"}
              linkTo="/financeiro/contas-receber"
              linkLabel="Ver contas a receber"
              emptyText="Nenhuma conta vencendo esta semana"
              items={receberProximasList.map((c) => ({
                id: c._id,
                title: c.descricao,
                subtitle: `${c.cliente?.nome ?? "Sem cliente"}${c.categoria ? ` • ${c.categoria.nome}` : ""}`,
                value: formatCurrency(c.valor - c.valorRecebido),
                meta: `Vence ${formatDate(c.dataVencimento)}`,
                itemIcon: <Clock className="h-4 w-4 text-violet-500" />,
                itemIconBg: "bg-violet-50",
                borderClass: "border-slate-100 bg-slate-50/80",
                valueClass: "text-foreground",
                metaClass: "text-violet-600",
              }))}
            />
          </div>
        </section>

        {/* Conciliação Bancária */}
        <section className="space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
              <GitCompareArrows className="h-4 w-4 text-violet-600" />
            </div>
            <h2 className="text-2xl font-semibold text-foreground">Conciliação Bancária</h2>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Total Transações"
              value={String(conciliacao.totalTransacoes)}
              subtitle={`${conciliacao.totalConciliadas} conciliadas`}
              icon={<GitCompareArrows className="h-5 w-5 text-white" />}
              accentClass="bg-violet-500"
            />
            <MetricCard
              title="Conciliadas"
              value={`${conciliacao.percentualConciliado}%`}
              subtitle={`${conciliacao.totalConciliadas} de ${conciliacao.totalTransacoes}`}
              icon={<CheckCircle2 className="h-5 w-5 text-white" />}
              accentClass="bg-emerald-500"
              valueClassName={conciliacao.percentualConciliado >= 80 ? "text-emerald-600" : conciliacao.percentualConciliado >= 50 ? "text-amber-600" : "text-red-500"}
            />
            <MetricCard
              title="Pendentes"
              value={String(conciliacao.totalPendentes)}
              subtitle={formatCurrency(conciliacao.valorPendente)}
              icon={<Clock className="h-5 w-5 text-white" />}
              accentClass="bg-amber-500"
              valueClassName={conciliacao.totalPendentes > 0 ? "text-amber-600" : undefined}
            />
            <MetricCard
              title="Valor Conciliado"
              value={formatCurrency(conciliacao.valorConciliado)}
              subtitle="total verificado"
              icon={<DollarSign className="h-5 w-5 text-white" />}
              accentClass="bg-blue-500"
            />
          </div>
        </section>

      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  accentClass,
  valueClassName,
  subtitleClassName,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  accentClass: string;
  valueClassName?: string;
  subtitleClassName?: string;
}) {
  return (
    <Card className="relative rounded-[28px] border-0 bg-white py-0 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
      <div className={`h-1.5 w-full ${accentClass}`} />
      <CardContent className="flex items-center justify-between gap-4 px-6 py-6">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className={`mt-3 text-3xl font-semibold text-foreground ${valueClassName ?? ""}`}>
            {value}
          </p>
          <p className={`mt-2 text-xs text-emerald-500 ${subtitleClassName ?? ""}`}>{subtitle}</p>
        </div>
        <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${accentClass}`}>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function ListCard({
  title,
  description,
  count,
  iconBg,
  icon,
  badgeVariant,
  linkTo,
  linkLabel,
  emptyText,
  items,
}: {
  title: string;
  description: string;
  count: number;
  iconBg: string;
  icon: React.ReactNode;
  badgeVariant: "destructive" | "warning" | "secondary";
  linkTo: string;
  linkLabel: string;
  emptyText: string;
  items: Array<{
    id: string;
    title: string;
    subtitle: string;
    value: string;
    meta: string;
    itemIcon: React.ReactNode;
    itemIconBg: string;
    borderClass: string;
    valueClass: string;
    metaClass: string;
  }>;
}) {
  return (
    <Card className="rounded-[28px] border-0 bg-white py-0 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
      <CardHeader className="px-6 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`mt-1 flex h-9 w-9 items-center justify-center rounded-full ${iconBg}`}>
              {icon}
            </div>
            <div>
              <CardTitle className="text-2xl font-semibold">{title}</CardTitle>
              <CardDescription className="mt-1 text-sm">{description}</CardDescription>
            </div>
          </div>
          <Badge variant={badgeVariant} className="rounded-full px-3 py-1">
            {count}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-6 pb-4">
        {items.length > 0 ? (
          items.map((item) => (
            <div
              key={item.id}
              className={`rounded-2xl border ${item.borderClass} px-4 py-3`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.itemIconBg}`}>
                    {item.itemIcon}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.subtitle}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold ${item.valueClass}`}>{item.value}</p>
                  <p className={`mt-1 text-xs ${item.metaClass}`}>{item.meta}</p>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {emptyText}
          </div>
        )}
      </CardContent>
      <div className="px-6 pb-6">
        <Link to={linkTo} className="flex items-center justify-center gap-1 text-sm font-medium text-rose-400">
          <span>{linkLabel}</span>
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </Card>
  );
}

function QuickActionButton({
  label,
  icon,
  className,
}: {
  label: string;
  icon: React.ReactNode;
  className?: string;
}) {
  return (
    <Button
      variant="outline"
      className={`h-24 w-full rounded-2xl border-0 bg-slate-100 text-sm font-medium text-foreground hover:bg-slate-200 ${className ?? ""}`}
    >
      <span className="flex flex-col items-center gap-3">
        {icon}
        {label}
      </span>
    </Button>
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
