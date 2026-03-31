import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import {
  Package,
  MapPin,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
} from "lucide-react";

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

  if (!summary) {
    return (
      <div className="p-4">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard de Estoque</h1>
        <p className="text-muted-foreground">Visão geral do sistema de inventário</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Produtos Cadastrados</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalProducts}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sites Ativos</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalSites}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Itens no Armazém</CardTitle>
            <Boxes className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalWarehouseItems}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Estoque Baixo</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{summary.lowStockCount}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowDownToLine className="h-4 w-4" />
              Recibos Pendentes
            </CardTitle>
            <CardDescription>Recibos aguardando aceitação</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-bold">{summary.pendingReceipts}</span>
              <Badge variant={summary.pendingReceipts > 0 ? "outline" : "secondary"}>
                {summary.pendingReceipts > 0 ? "Pendente" : "Nenhum"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowUpFromLine className="h-4 w-4" />
              Remessas Ativas
            </CardTitle>
            <CardDescription>Remessas em trânsito ou aguardando envio</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-bold">{summary.activeShipments}</span>
              <Badge variant={summary.activeShipments > 0 ? "outline" : "secondary"}>
                {summary.activeShipments > 0 ? "Em andamento" : "Nenhuma"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {lowStock && lowStock.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Alerta de Estoque Baixo
            </CardTitle>
            <CardDescription>
              Os seguintes produtos estão abaixo da quantidade mínima
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {lowStock.map((product) => (
                <div
                  key={product._id}
                  className="flex items-center justify-between p-2 bg-destructive/5 rounded-none"
                >
                  <div>
                    <p className="font-medium">{product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Mínimo: {product.minQuantity} {product.unit}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-destructive">
                      {product.currentStock} {product.unit}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Faltam: {product.deficit} {product.unit}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
