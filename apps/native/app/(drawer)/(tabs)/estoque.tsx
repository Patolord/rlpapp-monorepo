import { api } from "@rlpapp/backend/convex/_generated/api";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { Link } from "expo-router";
import { Button, Chip, Spinner, Surface, useThemeColor } from "heroui-native";
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
import { Pressable, Text, View } from "react-native";

import { Container } from "@/components/container";

export default function EstoqueTab() {
  return (
    <Container className="p-4">
      <View className="py-4 mb-4">
        <Text className="text-2xl font-semibold text-foreground tracking-tight">
          Dashboard de Estoque
        </Text>
        <Text className="text-muted text-sm mt-1">Visão geral do inventário</Text>
      </View>

      <Authenticated>
        <EstoqueDashboard />
      </Authenticated>
      <Unauthenticated>
        <Surface variant="secondary" className="p-6 rounded-lg items-center">
          <Lock size={48} color="#888" />
          <Text className="text-foreground font-medium mt-4">Acesso Restrito</Text>
          <Text className="text-muted text-sm text-center mt-2">
            Faça login para acessar o sistema de estoque
          </Text>
          <Link href="/(auth)/sign-in" asChild>
            <Button variant="primary" className="mt-4">
              <Button.Label>Entrar</Button.Label>
            </Button>
          </Link>
        </Surface>
      </Unauthenticated>
      <AuthLoading>
        <View className="flex-1 items-center justify-center">
          <Spinner size="lg" />
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

  const dangerColor = useThemeColor("danger");
  const successColor = useThemeColor("success");
  const foregroundColor = useThemeColor("foreground");
  const mutedColor = useThemeColor("muted");
  const primaryColor = "#3478f6";
  const secondaryColor = "#6d5efc";
  const neutralCardColor = "#f3f4f6";

  if (!summary) {
    return (
      <View className="flex-1 items-center justify-center py-8">
        <Spinner size="lg" />
      </View>
    );
  }

  return (
    <View className="gap-4">
      <View className="flex-row flex-wrap gap-3">
        <MetricCard
          title="Produtos Cadastrados"
          value={formatNumber(summary.totalProducts)}
          subtitle={`+${Math.max(summary.totalProducts - summary.totalSites, 0)} este mes`}
          icon={<Package size={18} color="#fff" />}
          topColor={primaryColor}
          iconBackground={primaryColor}
        />
        <MetricCard
          title="Sites Ativos"
          value={formatNumber(summary.totalSites)}
          subtitle={`+${summary.totalSites > 0 ? Math.min(summary.totalSites, 3) : 0} este mes`}
          icon={<MapPin size={18} color="#fff" />}
          topColor="#22c7f0"
          iconBackground="#22c7f0"
        />
        <MetricCard
          title="Itens no Armazem"
          value={formatNumber(summary.totalWarehouseItems)}
          subtitle={`+${Math.max(summary.pendingReceipts, 0)} em recebimento`}
          icon={<Warehouse size={18} color="#fff" />}
          topColor="#6d5efc"
          iconBackground="#6d5efc"
        />
        <MetricCard
          title="Estoque Baixo"
          value={formatNumber(summary.lowStockCount)}
          subtitle={`${summary.lowStockCount > 0 ? "-" : ""}${summary.lowStockCount} itens criticos`}
          icon={<TriangleAlert size={18} color="#fff" />}
          topColor="#ff9500"
          iconBackground="#ff9500"
          valueColor={summary.lowStockCount > 0 ? dangerColor : foregroundColor}
        />
      </View>

      <View className="gap-3">
        <Surface variant="secondary" className="rounded-2xl p-4">
          <View className="flex-row items-start justify-between mb-4">
            <View className="flex-1 pr-3">
              <View className="flex-row items-center gap-2">
                <IconBadge backgroundColor={primaryColor}>
                  <ArrowDownCircle size={16} color="#fff" />
                </IconBadge>
                <Text className="text-foreground text-lg font-semibold">Recibos Pendentes</Text>
              </View>
              <Text className="text-muted text-sm mt-1">Aguardando aceitacao</Text>
            </View>
            <Chip
              variant="secondary"
              color={summary.pendingReceipts > 0 ? "warning" : "default"}
              size="sm"
            >
              <Chip.Label>{summary.pendingReceipts}</Chip.Label>
            </Chip>
          </View>

          <View className="gap-3">
            {(receipts ?? []).slice(0, 3).map((receipt) => (
              <Surface key={receipt._id} variant="tertiary" className="rounded-xl p-3">
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
                        {receipt.supplier?.name ?? "Fornecedor nao informado"}
                      </Text>
                      <Text className="text-muted text-xs mt-1">
                        REC-{String(receipt._creationTime).slice(-4)} • {receipt.lines.length} itens
                      </Text>
                    </View>
                  </View>
                  <Chip
                    variant="secondary"
                    color={receipt.status === "PendingReceipt" ? "warning" : "success"}
                    size="sm"
                  >
                    <Chip.Label>
                      {receipt.status === "PendingReceipt" ? "Aguardando" : "Recebido"}
                    </Chip.Label>
                  </Chip>
                </View>
                <Text className="text-muted text-xs mt-3">{formatDate(receipt.createdAt)}</Text>
              </Surface>
            ))}

            {receipts && receipts.length === 0 && (
              <EmptyStateRow
                icon={<ArrowDownCircle size={18} color={successColor} />}
                text="Nenhum recibo pendente no momento"
              />
            )}
          </View>

          <Text className="text-sm mt-4 text-center" style={{ color: "#d46a6a" }}>
            Ver todos os recibos
          </Text>
        </Surface>

        <Surface variant="secondary" className="rounded-2xl p-4">
          <View className="flex-row items-start justify-between mb-4">
            <View className="flex-1 pr-3">
              <View className="flex-row items-center gap-2">
                <IconBadge backgroundColor="#6d5efc">
                  <ArrowUpCircle size={16} color="#fff" />
                </IconBadge>
                <Text className="text-foreground text-lg font-semibold">Remessas Ativas</Text>
              </View>
              <Text className="text-muted text-sm mt-1">Em transito ou aguardando envio</Text>
            </View>
            <Chip
              variant="secondary"
              color={summary.activeShipments > 0 ? "warning" : "default"}
              size="sm"
            >
              <Chip.Label>{summary.activeShipments}</Chip.Label>
            </Chip>
          </View>

          <View className="gap-3">
            {(shipments ?? []).slice(0, 3).map((shipment) => (
              <Surface key={shipment._id} variant="tertiary" className="rounded-xl p-3">
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
                        {shipment.site?.name ?? "Destino nao informado"}
                      </Text>
                      <Text className="text-muted text-xs mt-1">
                        ENV-{String(shipment._creationTime).slice(-4)} • {shipment.lines.length} itens
                      </Text>
                    </View>
                  </View>
                  <Chip
                    variant="secondary"
                    color={shipment.status === "PendingShipment" ? "warning" : "success"}
                    size="sm"
                  >
                    <Chip.Label>
                      {shipment.status === "PendingShipment" ? "Em transito" : "Preparando"}
                    </Chip.Label>
                  </Chip>
                </View>
                <Text className="text-muted text-xs mt-3">{formatDate(shipment.createdAt)}</Text>
              </Surface>
            ))}

            {shipments && shipments.length === 0 && (
              <EmptyStateRow
                icon={<ArrowUpCircle size={18} color={secondaryColor} />}
                text="Nenhuma remessa ativa no momento"
              />
            )}
          </View>

          <Text className="text-sm mt-4 text-center" style={{ color: "#d46a6a" }}>
            Ver todas as remessas
          </Text>
        </Surface>
      </View>

      <Surface variant="secondary" className="rounded-2xl p-4">
        <View className="flex-row items-center justify-between mb-4">
          <View>
            <Text className="text-foreground text-lg font-semibold">Acoes Rapidas</Text>
            <Text className="text-muted text-sm mt-1">Atalhos do modulo de estoque</Text>
          </View>
          <FileText size={18} color={mutedColor} />
        </View>

        <View className="flex-row flex-wrap gap-3">
          <QuickAction
            title="Novo Produto"
            icon={<Package size={18} color="#fff" />}
            backgroundColor={primaryColor}
            textColor="#fff"
          />
          <QuickAction
            title="Relatorio"
            icon={<FileText size={18} color={foregroundColor} />}
            backgroundColor={neutralCardColor}
            textColor={foregroundColor}
          />
          <QuickAction
            title="Buscar"
            icon={<Search size={18} color={foregroundColor} />}
            backgroundColor={neutralCardColor}
            textColor={foregroundColor}
          />
          <QuickAction
            title="Estoque Baixo"
            icon={<AlertTriangle size={18} color={dangerColor} />}
            backgroundColor={neutralCardColor}
            textColor={foregroundColor}
          />
        </View>
      </Surface>

      <Surface variant="secondary" className="rounded-2xl p-4">
        <View className="flex-row items-center justify-between mb-4">
          <View>
            <Text className="text-foreground text-lg font-semibold">Atividade Recente</Text>
            <Text className="text-muted text-sm mt-1">Ultimas movimentacoes do sistema</Text>
          </View>
          <Chip variant="secondary" size="sm">
            <Chip.Label>Hoje</Chip.Label>
          </Chip>
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
                <Text className="text-muted text-sm mt-1">{item.description}</Text>
                <Text className="text-muted text-xs mt-2">{item.meta}</Text>
              </View>
            </View>
          ))}
        </View>

        <View className="flex-row items-center justify-center gap-1 mt-2">
          <Text className="text-sm" style={{ color: "#d46a6a" }}>
            Ver todo o historico
          </Text>
          <ChevronRight size={14} color="#d46a6a" />
        </View>
      </Surface>

      {lowStockItems.length > 0 && (
        <Surface variant="secondary" className="rounded-2xl p-4">
          <View className="flex-row items-center gap-2 mb-4">
            <AlertCircle size={20} color={dangerColor} />
            <View className="flex-1">
              <Text className="text-foreground text-lg font-semibold">Itens com Estoque Baixo</Text>
              <Text className="text-muted text-sm mt-1">
                Produtos abaixo do minimo recomendado
              </Text>
            </View>
          </View>

          <View className="gap-3">
            {lowStockItems.slice(0, 5).map((product: any) => (
              <Surface key={product._id} variant="tertiary" className="rounded-xl p-3">
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-foreground font-medium">{product.name}</Text>
                    <Text className="text-muted text-xs mt-1">
                      Minimo: {product.minQuantity} {product.unit}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="font-bold" style={{ color: dangerColor }}>
                      {product.currentStock} {product.unit}
                    </Text>
                    <Text className="text-muted text-xs mt-1">Faltam: {product.deficit}</Text>
                  </View>
                </View>
              </Surface>
            ))}
          </View>
        </Surface>
      )}

      <View className="h-8" />
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
    <Surface variant="secondary" className="flex-1 min-w-[47%] rounded-2xl p-4 overflow-hidden">
      <View
        className="absolute left-0 right-0 top-0 h-1 rounded-t-2xl"
        style={{ backgroundColor: topColor }}
      />
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-muted text-xs">{title}</Text>
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
    </Surface>
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
      <Surface
        variant="tertiary"
        className="rounded-2xl px-4 py-5 items-center justify-center"
        style={{ backgroundColor }}
      >
        <View className="mb-3">{icon}</View>
        <Text className="font-medium text-sm" style={{ color: textColor }}>
          {title}
        </Text>
      </Surface>
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
      <Text className="text-muted text-sm">{text}</Text>
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
      description: `${summary.pendingReceipts} recebimentos aguardando conferencia`,
      meta: "Atualizado agora",
      backgroundColor: "#dff7eb",
      icon: <ArrowDownCircle size={18} color="#27ae60" />,
    },
    {
      title: "Remessa enviada",
      description: `${summary.activeShipments} remessas em andamento entre os sites`,
      meta: "Movimentacao de hoje",
      backgroundColor: "#e8f0ff",
      icon: <ArrowUpCircle size={18} color="#4f7cff" />,
    },
    {
      title: "Produto atualizado",
      description: `${summary.totalProducts} produtos ativos no catalogo`,
      meta: "Sincronizado com o cadastro",
      backgroundColor: "#fff2d9",
      icon: <FileText size={18} color="#ffb020" />,
    },
    {
      title: "Novo produto cadastrado",
      description: `${summary.totalSites} sites ativos para distribuicao`,
      meta: "Base pronta para expansao",
      backgroundColor: "#efe9ff",
      icon: <Package size={18} color="#7b61ff" />,
    },
    {
      title: "Alerta de estoque baixo",
      description: `${lowStock.length} itens abaixo do minimo recomendado`,
      meta: "Requer acompanhamento",
      backgroundColor: "#ffe6e6",
      icon: <AlertTriangle size={18} color="#e74c3c" />,
    },
  ];
}
