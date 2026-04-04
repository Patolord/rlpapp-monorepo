import { api } from "@rlpapp/backend/convex/_generated/api";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { Link } from "expo-router";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Boxes,
  ChevronRight,
  FileText,
  Lock,
  MapPin,
  Package,
  Search,
  TriangleAlert,
  Warehouse,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { Container } from "@/components/container";
import { Button, ButtonText } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function EstoqueTab() {
  return (
    <Container className="px-5 pt-4 pb-24">
      <View className="py-4 mb-4">
        <Text className="text-2xl font-semibold text-foreground tracking-tight">
          Estoque RLP
        </Text>

      </View>

      <Authenticated>
        <EstoqueDashboard />
      </Authenticated>
      <Unauthenticated>
        <Card className="p-6 items-center">
          <Lock size={48} color="#888" />
          <Text className="text-foreground font-medium mt-4">Acesso Restrito</Text>
          <Text className="text-muted-foreground text-sm text-center mt-2">
            Faça login para acessar o sistema de estoque
          </Text>
          <Link href="/(auth)/sign-in" asChild>
            <Button className="mt-4">
              <ButtonText>Entrar</ButtonText>
            </Button>
          </Link>
        </Card>
      </Unauthenticated>
      <AuthLoading>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      </AuthLoading>
    </Container>
  );
}

function EstoqueDashboard() {
  const summary = useQuery(api.inventory.getDashboardSummary);
  const lowStock = useQuery(api.products.getLowStock);
  const receipts = useQuery(api.receipts.list);
  const shipments = useQuery(api.shipments.list);
  const lowStockItems = lowStock ?? [];

  const primaryColor = "#3478f6";
  const secondaryColor = "#6d5efc";

  if (!summary) {
    return (
      <View className="flex-1 items-center justify-center py-8">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View className="gap-4">
      <View className="flex-row flex-wrap gap-3">
        <MetricCard
          title="Produtos Cadastrados"
          value={formatNumber(summary.totalProducts)}
          subtitle={`+${Math.max(summary.totalProducts - summary.totalSites, 0)} este mês`}
          icon={<Package size={18} color="#fff" />}
          topColor={primaryColor}
          iconBackground={primaryColor}
        />
        <MetricCard
          title="Sites Ativos"
          value={formatNumber(summary.totalSites)}
          subtitle={`+${summary.totalSites > 0 ? Math.min(summary.totalSites, 3) : 0} este mês`}
          icon={<MapPin size={18} color="#fff" />}
          topColor="#22c7f0"
          iconBackground="#22c7f0"
        />
        <MetricCard
          title="Itens no Armazém"
          value={formatNumber(summary.totalWarehouseItems)}
          subtitle={`+${Math.max(summary.pendingReceipts, 0)} em recebimento`}
          icon={<Warehouse size={18} color="#fff" />}
          topColor="#6d5efc"
          iconBackground="#6d5efc"
        />
        <MetricCard
          title="Estoque Baixo"
          value={formatNumber(summary.lowStockCount)}
          subtitle={`${summary.lowStockCount > 0 ? "-" : ""}${summary.lowStockCount} itens críticos`}
          icon={<TriangleAlert size={18} color="#fff" />}
          topColor="#ff9500"
          iconBackground="#ff9500"
          valueColor={summary.lowStockCount > 0 ? "#ef4444" : undefined}
        />
      </View>

      <View className="gap-3">
        <Card className="rounded-2xl p-4">
          <View className="flex-row items-start justify-between mb-4">
            <View className="flex-1 pr-3">
              <View className="flex-row items-center gap-2">
                <IconBadge backgroundColor={primaryColor}>
                  <ArrowDownCircle size={16} color="#fff" />
                </IconBadge>
                <Text className="text-foreground text-lg font-semibold">Recibos Pendentes</Text>
              </View>
              <Text className="text-muted-foreground text-sm mt-1">Aguardando aceitação</Text>
            </View>
            <Badge variant={summary.pendingReceipts > 0 ? "warning" : "secondary"}>
              {String(summary.pendingReceipts)}
            </Badge>
          </View>

          <View className="gap-3">
            {(receipts ?? []).slice(0, 3).map((receipt) => (
              <Card key={receipt._id} className="rounded-xl p-3 bg-secondary">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-row flex-1 gap-3">
                    <View
                      className="w-10 h-10 rounded-xl items-center justify-center"
                      style={{ backgroundColor: `${primaryColor}14` }}
                    >
                      <Boxes size={18} color={primaryColor} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-foreground font-medium">
                        {receipt.supplier?.name ?? "Fornecedor não informado"}
                      </Text>
                      <Text className="text-muted-foreground text-xs mt-1">
                        REC-{String(receipt._creationTime).slice(-4)} • {receipt.lines.length} itens
                      </Text>
                    </View>
                  </View>
                  <Badge variant={receipt.status === "PendingReceipt" ? "warning" : "success"}>
                    {receipt.status === "PendingReceipt" ? "Aguardando" : "Recebido"}
                  </Badge>
                </View>
                <Text className="text-muted-foreground text-xs mt-3">{formatDate(receipt.createdAt)}</Text>
              </Card>
            ))}

            {receipts && receipts.length === 0 && (
              <EmptyStateRow
                icon={<ArrowDownCircle size={18} color="#27ae60" />}
                text="Nenhum recibo pendente no momento"
              />
            )}
          </View>
        </Card>

        <Card className="rounded-2xl p-4">
          <View className="flex-row items-start justify-between mb-4">
            <View className="flex-1 pr-3">
              <View className="flex-row items-center gap-2">
                <IconBadge backgroundColor="#6d5efc">
                  <ArrowUpCircle size={16} color="#fff" />
                </IconBadge>
                <Text className="text-foreground text-lg font-semibold">Remessas Ativas</Text>
              </View>
              <Text className="text-muted-foreground text-sm mt-1">Em trânsito ou aguardando envio</Text>
            </View>
            <Badge variant={summary.activeShipments > 0 ? "warning" : "secondary"}>
              {String(summary.activeShipments)}
            </Badge>
          </View>

          <View className="gap-3">
            {(shipments ?? []).slice(0, 3).map((shipment) => (
              <Card key={shipment._id} className="rounded-xl p-3 bg-secondary">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-row flex-1 gap-3">
                    <View
                      className="w-10 h-10 rounded-xl items-center justify-center"
                      style={{ backgroundColor: "#6d5efc14" }}
                    >
                      <MapPin size={18} color="#6d5efc" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-foreground font-medium">
                        {shipment.site?.name ?? "Destino não informado"}
                      </Text>
                      <Text className="text-muted-foreground text-xs mt-1">
                        ENV-{String(shipment._creationTime).slice(-4)} • {shipment.lines.length} itens
                      </Text>
                    </View>
                  </View>
                  <Badge variant={shipment.status === "PendingShipment" ? "warning" : "success"}>
                    {shipment.status === "PendingShipment" ? "Em trânsito" : "Preparando"}
                  </Badge>
                </View>
                <Text className="text-muted-foreground text-xs mt-3">{formatDate(shipment.createdAt)}</Text>
              </Card>
            ))}

            {shipments && shipments.length === 0 && (
              <EmptyStateRow
                icon={<ArrowUpCircle size={18} color={secondaryColor} />}
                text="Nenhuma remessa ativa no momento"
              />
            )}
          </View>
        </Card>
      </View>

      <Card className="rounded-2xl p-4">
        <View className="flex-row items-center justify-between mb-4">
          <View>
            <Text className="text-foreground text-lg font-semibold">Ações Rápidas</Text>
            <Text className="text-muted-foreground text-sm mt-1">Atalhos do módulo de estoque</Text>
          </View>
          <FileText size={18} className="text-muted-foreground" />
        </View>

        <View className="flex-row flex-wrap gap-3">
          <QuickAction
            title="Novo Produto"
            icon={<Package size={18} color="#fff" />}
            backgroundColor={primaryColor}
            textColor="#fff"
          />
          <QuickAction
            title="Relatório"
            icon={<FileText size={18} color="#666" />}
            backgroundColor="#f3f4f6"
            textColor="#333"
          />
          <QuickAction
            title="Buscar"
            icon={<Search size={18} color="#666" />}
            backgroundColor="#f3f4f6"
            textColor="#333"
          />
          <QuickAction
            title="Estoque Baixo"
            icon={<AlertTriangle size={18} color="#ef4444" />}
            backgroundColor="#f3f4f6"
            textColor="#333"
          />
        </View>
      </Card>

      <Card className="rounded-2xl p-4">
        <View className="flex-row items-center justify-between mb-4">
          <View>
            <Text className="text-foreground text-lg font-semibold">Atividade Recente</Text>
            <Text className="text-muted-foreground text-sm mt-1">Últimas movimentações do sistema</Text>
          </View>
          <Badge variant="secondary">Hoje</Badge>
        </View>

        <View className="gap-4">
          {buildActivityItems(summary, lowStockItems).map((item, index) => (
            <View key={`${item.title}-${index}`} className="flex-row gap-3">
              <View className="items-center">
                <View
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: item.backgroundColor }}
                >
                  {item.icon}
                </View>
                {index < 4 && <View className="w-px flex-1 mt-2 bg-border" />}
              </View>
              <View className="flex-1 pb-3">
                <Text className="text-foreground font-medium">{item.title}</Text>
                <Text className="text-muted-foreground text-sm mt-1">{item.description}</Text>
                <Text className="text-muted-foreground text-xs mt-2">{item.meta}</Text>
              </View>
            </View>
          ))}
        </View>

        <View className="flex-row items-center justify-center gap-1 mt-2">
          <Text className="text-sm text-primary">Ver todo o histórico</Text>
          <ChevronRight size={14} color="#3478f6" />
        </View>
      </Card>

      {lowStockItems.length > 0 && (
        <Card className="rounded-2xl p-4">
          <View className="flex-row items-center gap-2 mb-4">
            <AlertCircle size={20} color="#ef4444" />
            <View className="flex-1">
              <Text className="text-foreground text-lg font-semibold">Itens com Estoque Baixo</Text>
              <Text className="text-muted-foreground text-sm mt-1">
                Produtos abaixo do mínimo recomendado
              </Text>
            </View>
          </View>

          <View className="gap-3">
            {lowStockItems.slice(0, 5).map((product: any) => (
              <Card key={product._id} className="rounded-xl p-3 bg-secondary">
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-foreground font-medium">{product.name}</Text>
                    <Text className="text-muted-foreground text-xs mt-1">
                      Mínimo: {product.minQuantity} {product.unit}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="font-bold text-destructive">
                      {product.currentStock} {product.unit}
                    </Text>
                    <Text className="text-muted-foreground text-xs mt-1">Faltam: {product.deficit}</Text>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        </Card>
      )}

      <View className="h-24" />
    </View>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  topColor,
  iconBackground,
  valueColor,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: ReactNode;
  topColor: string;
  iconBackground: string;
  valueColor?: string;
}) {
  return (
    <Card className="flex-1 min-w-[47%] rounded-2xl p-4 overflow-hidden">
      <View
        className="absolute left-0 right-0 top-0 h-1 rounded-t-2xl"
        style={{ backgroundColor: topColor }}
      />
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-muted-foreground text-xs">{title}</Text>
          <Text
            className="text-foreground text-3xl font-bold mt-3"
            style={valueColor ? { color: valueColor } : undefined}
          >
            {value}
          </Text>
          <Text className="text-xs mt-2" style={{ color: "#3cab7c" }}>
            {subtitle}
          </Text>
        </View>
        <View
          className="w-12 h-12 rounded-2xl items-center justify-center"
          style={{ backgroundColor: iconBackground }}
        >
          {icon}
        </View>
      </View>
    </Card>
  );
}

function QuickAction({
  title,
  icon,
  backgroundColor,
  textColor,
}: {
  title: string;
  icon: ReactNode;
  backgroundColor: string;
  textColor: string;
}) {
  return (
    <Pressable className="w-[48%]">
      <View
        className="rounded-2xl px-4 py-5 items-center justify-center"
        style={{ backgroundColor }}
      >
        <View className="mb-3">{icon}</View>
        <Text className="font-medium text-sm" style={{ color: textColor }}>
          {title}
        </Text>
      </View>
    </Pressable>
  );
}

function IconBadge({
  children,
  backgroundColor,
}: {
  children: ReactNode;
  backgroundColor: string;
}) {
  return (
    <View
      className="w-8 h-8 rounded-full items-center justify-center"
      style={{ backgroundColor }}
    >
      {children}
    </View>
  );
}

function EmptyStateRow({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <View className="flex-row items-center gap-3 rounded-xl px-1 py-3">
      {icon}
      <Text className="text-muted-foreground text-sm">{text}</Text>
    </View>
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

function buildActivityItems(summary: any, lowStock: any[]) {
  return [
    {
      title: "Nova entrada de estoque",
      description: `${summary.pendingReceipts} recebimentos aguardando conferência`,
      meta: "Atualizado agora",
      backgroundColor: "#dff7eb",
      icon: <ArrowDownCircle size={18} color="#27ae60" />,
    },
    {
      title: "Remessa enviada",
      description: `${summary.activeShipments} remessas em andamento entre os sites`,
      meta: "Movimentação de hoje",
      backgroundColor: "#e8f0ff",
      icon: <ArrowUpCircle size={18} color="#4f7cff" />,
    },
    {
      title: "Produto atualizado",
      description: `${summary.totalProducts} produtos ativos no catálogo`,
      meta: "Sincronizado com o cadastro",
      backgroundColor: "#fff2d9",
      icon: <FileText size={18} color="#ffb020" />,
    },
    {
      title: "Novo produto cadastrado",
      description: `${summary.totalSites} sites ativos para distribuição`,
      meta: "Base pronta para expansão",
      backgroundColor: "#efe9ff",
      icon: <Package size={18} color="#7b61ff" />,
    },
    {
      title: "Alerta de estoque baixo",
      description: `${lowStock.length} itens abaixo do mínimo recomendado`,
      meta: "Requer acompanhamento",
      backgroundColor: "#ffe6e6",
      icon: <AlertTriangle size={18} color="#e74c3c" />,
    },
  ];
}
