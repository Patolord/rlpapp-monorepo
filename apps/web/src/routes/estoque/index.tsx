import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { Link } from "@tanstack/react-router";
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
  ClipboardList,
  ClipboardCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConvexUnauthRedirect } from "@/components/convex-unauth-redirect";

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
    <div className="min-h-full p-6">
      <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight">Dashboard de Estoque</h1>
        <p className="text-sm text-muted-foreground">Visão geral do sistema de inventário</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          title="Produtos Cadastrados"
          value={formatNumber(summary.totalProducts)}
          subtitle={`+${Math.max(summary.totalProducts - summary.totalSites, 0)} este mes`}
          icon={<Package className="h-5 w-5 text-foreground" />}
        />
        <MetricCard
          title="Sites Ativos"
          value={formatNumber(summary.totalSites)}
          subtitle={`+${summary.totalSites > 0 ? Math.min(summary.totalSites, 3) : 0} este mes`}
          icon={<MapPin className="h-5 w-5 text-foreground" />}
        />
        <MetricCard
          title="Itens no Armazem"
          value={formatNumber(summary.totalWarehouseItems)}
          subtitle={`+${summary.pendingReceipts} em recebimento`}
          icon={<Warehouse className="h-5 w-5 text-foreground" />}
        />
        <MetricCard
          title="Estoque Baixo"
          value={formatNumber(summary.lowStockCount)}
          subtitle={`${summary.lowStockCount} itens criticos`}
          icon={<AlertTriangle className="h-5 w-5 text-foreground" />}
        />
        <MetricCard
          title="Solicitações Pendentes"
          value={formatNumber(summary.pendingMaterialRequests ?? 0)}
          subtitle={`${summary.approvedMaterialRequests ?? 0} aprovadas aguardando envio`}
          icon={<ClipboardList className="h-5 w-5 text-foreground" />}
          valueClassName={(summary.pendingMaterialRequests ?? 0) > 0 ? "text-rose-600" : undefined}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <DashboardListCard
          title="Solicitações de Material"
          description="Pedidos dos operadores aguardando revisão"
          count={summary.pendingMaterialRequests ?? 0}
          countVariant={(summary.pendingMaterialRequests ?? 0) > 0 ? "warning" : "secondary"}
          icon={<ClipboardList className="h-4 w-4 text-foreground" />}
          footerLabel="Ver todas as solicitações"
          footerLink="/estoque/solicitacoes"
          items={(summary.recentPendingRequests ?? []).map((req: any) => ({
            id: req._id,
            title: req.requesterName,
            subtitle: `${req.siteName} • ${req.lineCount} produto(s) • ${req.urgency === "critico" ? "CRÍTICO" : req.urgency === "urgente" ? "Urgente" : "Normal"}`,
            meta: `Necessário até ${formatDate(req.dateNeeded)}`,
            badge: req.urgency === "critico" ? "Crítico" : req.urgency === "urgente" ? "Urgente" : "Pendente",
            badgeVariant: req.urgency === "critico" ? "warning" : req.urgency === "urgente" ? "warning" : "success" as "warning" | "success",
            avatarIcon: <ClipboardList className="h-4 w-4 text-foreground" />,
          }))}
          emptyText="Nenhuma solicitação pendente no momento"
        />

        <DashboardListCard
          title="Entregas Recentes"
          description="Últimas confirmações de recebimento via QR"
          count={(summary.recentDeliveries ?? []).length}
          countVariant="secondary"
          icon={<ClipboardCheck className="h-4 w-4 text-foreground" />}
          footerLabel="Ver histórico completo"
          footerLink="/estoque/historico-entregas"
          items={(summary.recentDeliveries ?? []).map((d: any) => ({
            id: d._id,
            title: d.receiverName,
            subtitle: `${d.siteName}`,
            meta: formatDateTime(d.confirmedAt),
            badge: "Entregue",
            badgeVariant: "success" as "warning" | "success",
            avatarIcon: <ClipboardCheck className="h-4 w-4 text-foreground" />,
          }))}
          emptyText="Nenhuma entrega confirmada ainda"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr_280px]">
        <DashboardListCard
          title="Recibos Pendentes"
          description="Aguardando aceitacao"
          count={summary.pendingReceipts}
          countVariant={summary.pendingReceipts > 0 ? "warning" : "secondary"}
          icon={<ArrowDownToLine className="h-4 w-4 text-foreground" />}
          footerLabel="Ver todos os recibos"
          items={recentReceipts.map((receipt) => ({
            id: receipt._id,
            title: receipt.supplier?.name ?? "Fornecedor nao informado",
            subtitle: `REC-${String(receipt._creationTime).slice(-4)} • ${receipt.lines.length} itens`,
            meta: formatDate(receipt.createdAt),
            badge: receipt.status === "PendingReceipt" ? "Aguardando" : "Recebido",
            badgeVariant: receipt.status === "PendingReceipt" ? "warning" : "success",
            avatarIcon: <Boxes className="h-4 w-4 text-foreground" />,
          }))}
          emptyText="Nenhum recibo pendente no momento"
        />

        <DashboardListCard
          title="Remessas Ativas"
          description="Em transito ou aguardando envio"
          count={summary.activeShipments}
          countVariant={summary.activeShipments > 0 ? "warning" : "secondary"}
          icon={<ArrowUpFromLine className="h-4 w-4 text-foreground" />}
          footerLabel="Ver todas as remessas"
          items={recentShipments.map((shipment) => ({
            id: shipment._id,
            title: shipment.site?.name ?? "Destino nao informado",
            subtitle: `ENV-${String(shipment._creationTime).slice(-4)} • ${shipment.lines.length} itens`,
            meta: formatDate(shipment.createdAt),
            badge: shipment.status === "PendingShipment" ? "Em transito" : "Preparando",
            badgeVariant: shipment.status === "PendingShipment" ? "warning" : "success",
            avatarIcon: <MapPin className="h-4 w-4 text-foreground" />,
          }))}
          emptyText="Nenhuma remessa ativa no momento"
        />

        <Card className="rounded-2xl border border-border bg-card py-0 shadow-sm">
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
              label="Solicitações"
              icon={<ClipboardList className="h-4 w-4" />}
            />
            <QuickActionButton
              label="Entregas"
              icon={<ClipboardCheck className="h-4 w-4" />}
            />
            <QuickActionButton
              label="Buscar"
              icon={<Search className="h-4 w-4" />}
            />
            <QuickActionButton
              label="Estoque Baixo"
              icon={<AlertTriangle className="h-4 w-4" />}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border border-border bg-card py-0 shadow-sm">
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
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    {item.icon}
                  </div>
                  {index < 4 && <div className="mt-2 h-full w-px bg-border" />}
                </div>
                <div className="pb-2">
                  <p className="text-base font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{item.meta}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-center gap-1 text-sm font-medium text-foreground">
            <span>Ver todo o historico</span>
            <ChevronRight className="h-4 w-4" />
          </div>
        </CardContent>
      </Card>

      {lowStockItems.length > 0 && (
        <Card className="rounded-2xl border border-border bg-card py-0 shadow-sm">
          <CardHeader className="px-6 pt-6">
            <CardTitle className="flex items-center gap-2 text-2xl font-semibold">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
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
                className="flex items-center justify-between rounded-xl border border-border bg-muted/50 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold">{product.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Minimo: {product.minQuantity} {product.unit}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">
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
  valueClassName,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <Card className="relative overflow-hidden rounded-2xl border border-border bg-card py-0 shadow-sm">
      <CardContent className="flex items-center justify-between gap-4 px-6 py-6">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className={`mt-3 text-4xl font-semibold ${valueClassName ?? ""}`}>
            {value}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
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
  footerLabel,
  footerLink,
  items,
  emptyText,
}: {
  title: string;
  description: string;
  count: number;
  countVariant: "secondary" | "warning";
  icon: React.ReactNode;
  footerLabel: string;
  footerLink?: string;
  items: Array<{
    id: string;
    title: string;
    subtitle: string;
    meta: string;
    badge: string;
    badgeVariant: "warning" | "success";
    avatarIcon: React.ReactNode;
  }>;
  emptyText: string;
}) {
  return (
    <Card className="rounded-2xl border border-border bg-card py-0 shadow-sm">
      <CardHeader className="px-6 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-muted">
              {icon}
            </div>
            <div>
              <CardTitle className="text-2xl font-semibold">{title}</CardTitle>
              <CardDescription className="mt-1 text-sm">{description}</CardDescription>
            </div>
          </div>
          <Badge
            variant={countVariant}
            className="rounded-full px-3 py-1"
          >
            {count}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-6 pb-4">
        {items.length > 0 ? (
          items.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-border bg-muted/50 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                    {item.avatarIcon}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.subtitle}</p>
                  </div>
                </div>
                <Badge
                  variant={item.badgeVariant}
                  className="rounded-full px-2.5 py-1"
                >
                  {item.badge}
                </Badge>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{item.meta}</p>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            {emptyText}
          </div>
        )}
      </CardContent>
      {footerLink ? (
        <Link to={footerLink} className="block px-6 pb-6 text-center text-sm font-medium text-foreground hover:text-foreground/80">
          {footerLabel} <ChevronRight className="inline h-4 w-4" />
        </Link>
      ) : (
        <div className="px-6 pb-6 text-center text-sm font-medium">{footerLabel}</div>
      )}
    </Card>
  );
}

function QuickActionButton({
  label,
  icon,
}: {
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <Button
      variant="outline"
      className="h-24 rounded-2xl border border-border bg-muted/50 text-sm font-medium hover:bg-muted"
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

function formatDateTime(timestamp: number) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function buildActivityItems(
  summary: {
    pendingReceipts: number;
    activeShipments: number;
    totalProducts: number;
    totalSites: number;
    pendingMaterialRequests?: number;
    approvedMaterialRequests?: number;
  },
  lowStock: Array<{ name: string }>,
) {
  const items = [];

  if ((summary.pendingMaterialRequests ?? 0) > 0) {
    items.push({
      title: "Solicitações de material pendentes",
      description: `${summary.pendingMaterialRequests} solicitações aguardando aprovação do administrador`,
      meta: "Requer ação imediata",
      icon: <ClipboardList className="h-4 w-4 text-foreground" />,
    });
  }

  if ((summary.approvedMaterialRequests ?? 0) > 0) {
    items.push({
      title: "Solicitações aprovadas",
      description: `${summary.approvedMaterialRequests} solicitação(ões) aprovada(s) aguardando conversão em remessa`,
      meta: "Pronto para envio",
      icon: <ClipboardCheck className="h-4 w-4 text-foreground" />,
    });
  }

  items.push(
    {
      title: "Nova entrada de estoque",
      description: `${summary.pendingReceipts} recebimentos aguardando conferencia`,
      meta: "Atualizado agora",
      icon: <ArrowDownToLine className="h-4 w-4 text-foreground" />,
    },
    {
      title: "Remessas ativas",
      description: `${summary.activeShipments} remessas em andamento entre os sites`,
      meta: "Movimentacao de hoje",
      icon: <ArrowUpFromLine className="h-4 w-4 text-foreground" />,
    },
    {
      title: "Catalogo de produtos",
      description: `${summary.totalProducts} produtos ativos no catalogo`,
      meta: "Sincronizado com o cadastro",
      icon: <FileText className="h-4 w-4 text-foreground" />,
    },
    {
      title: "Alerta de estoque baixo",
      description: `${lowStock.length} itens abaixo do minimo recomendado`,
      meta: "Requer acompanhamento",
      icon: <AlertTriangle className="h-4 w-4 text-foreground" />,
    },
  );

  return items;
}
