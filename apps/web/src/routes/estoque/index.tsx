import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import {
  ChevronRight,
  Package,
  MapPin,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  FileText,
  Search,
  Warehouse,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/estoque/")({
  component: EstoqueDashboard,
});

function EstoqueDashboard() {
  return (
    <>
      <Authenticated>
        <DashboardContent />
      </Authenticated>
      <Unauthenticated>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Faça login para acessar o estoque</p>
        </div>
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
  const summary = useQuery(api.inventory.getDashboardSummary);
  const lowStock = useQuery(api.products.getLowStock);
  const receipts = useQuery(api.receipts.list);
  const shipments = useQuery(api.shipments.list);

  if (!summary) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Carregando dashboard...</p>
      </div>
    );
  }

  const recentReceipts = (receipts ?? []).slice(0, 3);
  const recentShipments = (shipments ?? []).slice(0, 3);
  const lowStockItems = lowStock ?? [];

  return (
    <div className="min-h-full bg-[#f7f7f6] p-6">
      <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">Dashboard de Estoque</h1>
        <p className="text-muted-foreground">Visão geral do sistema de inventário</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Produtos Cadastrados"
          value={formatNumber(summary.totalProducts)}
          subtitle={`+${Math.max(summary.totalProducts - summary.totalSites, 0)} este mes`}
          icon={<Package className="h-5 w-5 text-white" />}
          accentClass="bg-blue-500"
        />
        <MetricCard
          title="Sites Ativos"
          value={formatNumber(summary.totalSites)}
          subtitle={`+${summary.totalSites > 0 ? Math.min(summary.totalSites, 3) : 0} este mes`}
          icon={<MapPin className="h-5 w-5 text-white" />}
          accentClass="bg-cyan-500"
        />
        <MetricCard
          title="Itens no Armazem"
          value={formatNumber(summary.totalWarehouseItems)}
          subtitle={`+${summary.pendingReceipts} em recebimento`}
          icon={<Warehouse className="h-5 w-5 text-white" />}
          accentClass="bg-violet-500"
        />
        <MetricCard
          title="Estoque Baixo"
          value={formatNumber(summary.lowStockCount)}
          subtitle={`${summary.lowStockCount} itens criticos`}
          icon={<AlertTriangle className="h-5 w-5 text-white" />}
          accentClass="bg-orange-500"
          valueClassName={summary.lowStockCount > 0 ? "text-red-500" : undefined}
          subtitleClassName={summary.lowStockCount > 0 ? "text-red-400" : undefined}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr_280px]">
        <DashboardListCard
          title="Recibos Pendentes"
          description="Aguardando aceitacao"
          count={summary.pendingReceipts}
          countVariant={summary.pendingReceipts > 0 ? "warning" : "secondary"}
          icon={<ArrowDownToLine className="h-4 w-4 text-white" />}
          iconClassName="bg-blue-500"
          footerLabel="Ver todos os recibos"
          items={recentReceipts.map((receipt) => ({
            id: receipt._id,
            title: receipt.supplier?.name ?? "Fornecedor nao informado",
            subtitle: `REC-${String(receipt._creationTime).slice(-4)} • ${receipt.lines.length} itens`,
            meta: formatDate(receipt.createdAt),
            badge: receipt.status === "PendingReceipt" ? "Aguardando" : "Recebido",
            badgeVariant: receipt.status === "PendingReceipt" ? "warning" : "success",
            avatarIcon: <Boxes className="h-4 w-4 text-blue-500" />,
            avatarClassName: "bg-blue-50",
          }))}
          emptyText="Nenhum recibo pendente no momento"
        />

        <DashboardListCard
          title="Remessas Ativas"
          description="Em transito ou aguardando envio"
          count={summary.activeShipments}
          countVariant={summary.activeShipments > 0 ? "warning" : "secondary"}
          icon={<ArrowUpFromLine className="h-4 w-4 text-white" />}
          iconClassName="bg-violet-500"
          footerLabel="Ver todas as remessas"
          items={recentShipments.map((shipment) => ({
            id: shipment._id,
            title: shipment.site?.name ?? "Destino nao informado",
            subtitle: `ENV-${String(shipment._creationTime).slice(-4)} • ${shipment.lines.length} itens`,
            meta: formatDate(shipment.createdAt),
            badge: shipment.status === "PendingShipment" ? "Em transito" : "Preparando",
            badgeVariant: shipment.status === "PendingShipment" ? "warning" : "success",
            avatarIcon: <MapPin className="h-4 w-4 text-violet-500" />,
            avatarClassName: "bg-violet-50",
          }))}
          emptyText="Nenhuma remessa ativa no momento"
        />

        <Card className="rounded-[28px] border-0 bg-white py-0 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
          <CardHeader className="px-6 pt-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-2xl font-semibold">Acoes Rapidas</CardTitle>
                <CardDescription className="mt-1 text-sm">
                  Atalhos do modulo de estoque
                </CardDescription>
              </div>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 px-6 pb-6 sm:grid-cols-2 xl:grid-cols-2">
            <QuickActionButton
              label="Novo Produto"
              icon={<Package className="h-4 w-4" />}
              className="bg-blue-500 text-white hover:bg-blue-600"
            />
            <QuickActionButton
              label="Relatorio"
              icon={<FileText className="h-4 w-4" />}
            />
            <QuickActionButton
              label="Buscar"
              icon={<Search className="h-4 w-4" />}
            />
            <QuickActionButton
              label="Estoque Baixo"
              icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[32px] border-0 bg-white py-0 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <CardHeader className="px-6 pt-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-2xl font-semibold">Atividade Recente</CardTitle>
              <CardDescription className="mt-1 text-sm">
                Ultimas movimentacoes do sistema
              </CardDescription>
            </div>
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              Hoje
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <div className="space-y-6">
            {buildActivityItems(summary, lowStockItems).map((item, index) => (
              <div key={`${item.title}-${index}`} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full ${item.iconBg}`}>
                    {item.icon}
                  </div>
                  {index < 4 && <div className="mt-2 h-full w-px bg-border" />}
                </div>
                <div className="pb-2">
                  <p className="text-base font-semibold text-foreground">{item.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{item.meta}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-center gap-1 text-sm font-medium text-rose-400">
            <span>Ver todo o historico</span>
            <ChevronRight className="h-4 w-4" />
          </div>
        </CardContent>
      </Card>

      {lowStockItems.length > 0 && (
        <Card className="rounded-[28px] border-0 bg-white py-0 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
          <CardHeader className="px-6 pt-6">
            <CardTitle className="flex items-center gap-2 text-2xl font-semibold text-foreground">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Itens com Estoque Baixo
            </CardTitle>
            <CardDescription className="text-sm">
              Produtos abaixo do minimo recomendado
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-6 pb-6">
            {lowStockItems.slice(0, 5).map((product) => (
              <div
                key={product._id}
                className="flex items-center justify-between rounded-2xl bg-red-50/70 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">{product.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Minimo: {product.minQuantity} {product.unit}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-red-500">
                    {product.currentStock} {product.unit}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Faltam: {product.deficit} {product.unit}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
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
          <p className={`mt-3 text-4xl font-semibold text-foreground ${valueClassName ?? ""}`}>
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

function DashboardListCard({
  title,
  description,
  count,
  countVariant,
  icon,
  iconClassName,
  footerLabel,
  items,
  emptyText,
}: {
  title: string;
  description: string;
  count: number;
  countVariant: "secondary" | "warning";
  icon: React.ReactNode;
  iconClassName: string;
  footerLabel: string;
  items: Array<{
    id: string;
    title: string;
    subtitle: string;
    meta: string;
    badge: string;
    badgeVariant: "warning" | "success";
    avatarIcon: React.ReactNode;
    avatarClassName: string;
  }>;
  emptyText: string;
}) {
  return (
    <Card className="rounded-[28px] border-0 bg-white py-0 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
      <CardHeader className="px-6 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`mt-1 flex h-9 w-9 items-center justify-center rounded-full ${iconClassName}`}>
              {icon}
            </div>
            <div>
              <CardTitle className="text-2xl font-semibold">{title}</CardTitle>
              <CardDescription className="mt-1 text-sm">{description}</CardDescription>
            </div>
          </div>
          <Badge variant={countVariant} className="rounded-full px-3 py-1">
            {count}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-6 pb-4">
        {items.length > 0 ? (
          items.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.avatarClassName}`}
                  >
                    {item.avatarIcon}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.subtitle}</p>
                  </div>
                </div>
                <Badge variant={item.badgeVariant} className="rounded-full px-2.5 py-1">
                  {item.badge}
                </Badge>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{item.meta}</p>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            {emptyText}
          </div>
        )}
      </CardContent>
      <div className="px-6 pb-6 text-center text-sm font-medium text-rose-400">{footerLabel}</div>
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
      className={`h-24 rounded-2xl border-0 bg-slate-100 text-sm font-medium text-foreground hover:bg-slate-200 ${className ?? ""}`}
    >
      <span className="flex flex-col items-center gap-3">
        {icon}
        {label}
      </span>
    </Button>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(timestamp);
}

function buildActivityItems(summary: { pendingReceipts: number; activeShipments: number; totalProducts: number; totalSites: number }, lowStock: Array<{ name: string }>) {
  return [
    {
      title: "Nova entrada de estoque",
      description: `${summary.pendingReceipts} recebimentos aguardando conferencia`,
      meta: "Atualizado agora",
      iconBg: "bg-emerald-100",
      icon: <ArrowDownToLine className="h-4 w-4 text-emerald-600" />,
    },
    {
      title: "Remessa enviada",
      description: `${summary.activeShipments} remessas em andamento entre os sites`,
      meta: "Movimentacao de hoje",
      iconBg: "bg-blue-100",
      icon: <ArrowUpFromLine className="h-4 w-4 text-blue-600" />,
    },
    {
      title: "Produto atualizado",
      description: `${summary.totalProducts} produtos ativos no catalogo`,
      meta: "Sincronizado com o cadastro",
      iconBg: "bg-amber-100",
      icon: <FileText className="h-4 w-4 text-amber-600" />,
    },
    {
      title: "Novo produto cadastrado",
      description: `${summary.totalSites} sites ativos para distribuicao`,
      meta: "Base pronta para expansao",
      iconBg: "bg-violet-100",
      icon: <Package className="h-4 w-4 text-violet-600" />,
    },
    {
      title: "Alerta de estoque baixo",
      description: `${lowStock.length} itens abaixo do minimo recomendado`,
      meta: "Requer acompanhamento",
      iconBg: "bg-red-100",
      icon: <AlertTriangle className="h-4 w-4 text-red-500" />,
    },
  ];
}
