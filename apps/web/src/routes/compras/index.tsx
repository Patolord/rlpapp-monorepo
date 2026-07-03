import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
  AlertTriangle,
  ClipboardList,
  Package,
  Receipt,
  Truck,
} from "lucide-react";
import { useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/compras/")({
  component: ComprasDashboardPage,
});

const cardCls = "rounded-2xl border border-slate-100 bg-white shadow-sm";

function ComprasDashboardPage() {
  return (
    <AuthShell>
      <ComprasDashboardContent />
    </AuthShell>
  );
}

function ComprasDashboardContent() {
  const [now] = useState(() => Date.now());
  const stats = useQuery(api.priceEvents.dashboardStats, { now });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Compras</h1>
        <p className="text-sm text-muted-foreground">
          Catálogo, fornecedores e inteligência de preços.
        </p>
      </div>

      {stats === undefined ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              icon={Package}
              label="Materiais ativos"
              value={stats.activeMaterials}
              to="/compras/materiais"
            />
            <StatCard
              icon={Truck}
              label="Fornecedores ativos"
              value={stats.activeSuppliers}
              to="/compras/fornecedores"
            />
            <StatCard
              icon={AlertTriangle}
              label="Preços pendentes"
              value={stats.unreviewedPrices}
              to="/compras/fila-revisao"
              highlight={stats.unreviewedPrices > 0}
            />
            <StatCard
              icon={Receipt}
              label="Preços obsoletos (recentes)"
              value={stats.stalePrices}
              to="/compras/eventos-preco"
            />
            <StatCard
              icon={ClipboardList}
              label="Itens sem preço estimado"
              value={stats.takeoffsNeedingPricing}
              to="/compras/takeoffs"
            />
            <StatCard
              icon={Receipt}
              label="Eventos recentes"
              value={stats.recentEvents}
              to="/compras/eventos-preco"
            />
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  to,
  highlight,
}: {
  icon: typeof Package;
  label: string;
  value: number;
  to: string;
  highlight?: boolean;
}) {
  return (
    <Link to={to}>
      <Card className={`${cardCls} transition-shadow hover:shadow-md`}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {label}
          </CardTitle>
          <Icon className={`size-4 ${highlight ? "text-amber-500" : "text-slate-400"}`} />
        </CardHeader>
        <CardContent>
          <p className={`text-3xl font-bold ${highlight ? "text-amber-600" : ""}`}>
            {value}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
