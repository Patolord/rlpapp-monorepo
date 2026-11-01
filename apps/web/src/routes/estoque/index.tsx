import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { usePaginatedQuery, useQuery } from "convex/react";
import {
  CheckCircle2,
  ClipboardList,
  History,
  Package,
  Plus,
  ShieldAlert,
  Warehouse,
} from "lucide-react";
import { MetricCard, MetricStrip } from "@rlpapp/ui/web";
import { useEffect, useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import { InventoryApprovals } from "@/components/estoque/inventory-approvals";
import { InventoryDocumentsHistory } from "@/components/estoque/inventory-documents-history";
import { InventoryRules } from "@/components/estoque/inventory-rules";
import { ObraMaterialRequests } from "@/components/estoque/obra-material-requests";
import { BalancesDataTable } from "@/components/estoque/balances-table/balances-data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/estoque/")({
  component: EstoquePage,
});

type Section = "central" | "movimentacoes" | "pedidos" | "aprovacoes" | "regras";

function EstoquePage() {
  return (
    <AuthShell>
      <EstoqueContent />
    </AuthShell>
  );
}

function EstoqueContent() {
  const access = useQuery(api.inventory.getAccess, {});
  const materials = useQuery(api.inventory.listMaterialOptions, {});
  const approvals = useQuery(api.inventory.listPendingApprovals, {});
  const rules = useQuery(api.inventory.listRules, {});
  const projects = useQuery(api.inventory.listProjects, {});
  const materialRequests = useQuery(api.inventoryRequests.listOfficeRequests, {});
  const centralBalances = usePaginatedQuery(
    api.inventory.listBalances,
    access?.canViewCentral ? {} : "skip",
    { initialNumItems: 100 }
  );
  const documents = usePaginatedQuery(
    api.inventory.listDocuments,
    {},
    { initialNumItems: 20 }
  );

  const [section, setSection] = useState<Section>("central");

  useEffect(() => {
    if (access && !access.canViewCentral && section === "central") {
      setSection("movimentacoes");
    }
  }, [access, section]);

  if (!access || !materials || !approvals || !rules || !projects || !materialRequests) {
    return (
      <div className="mx-auto max-w-7xl py-16 text-center text-sm text-muted-foreground">
        Carregando estoque...
      </div>
    );
  }

  const sections: Array<{ key: Section; label: string; icon: typeof Package }> = [
    ...(access.canViewCentral
      ? [{ key: "central" as const, label: "Central", icon: Warehouse }]
      : []),
    { key: "movimentacoes", label: "Movimentações", icon: History },
    {
      key: "pedidos" as const,
      label: "Pedidos de obra",
      icon: ClipboardList,
    },
    ...(access.isEngineer
      ? [{ key: "aprovacoes" as const, label: "Aprovações", icon: ShieldAlert }]
      : []),
    { key: "regras", label: "Regras", icon: CheckCircle2 },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Estoque central</h1>
          <p className="text-sm text-muted-foreground">
            Controle do armazém central, entradas e envios para as obras.
          </p>
        </div>
        <Button render={<Link to="/estoque/movimentacao" />}>
          <Plus className="mr-2 size-4" />
          Nova movimentação
        </Button>
      </div>

      <MetricStrip>
        {access.canViewCentral && (
          <MetricCard
            title="Materiais no central"
            value={String(
              centralBalances.results.filter((balance) => balance.quantity > 0)
                .length
            )}
          />
        )}
        <MetricCard
          title="Movimentações carregadas"
          value={String(documents.results.length)}
        />
        <MetricCard
          title="Suas aprovações pendentes"
          value={String(approvals.length)}
        />
      </MetricStrip>

      <div className="flex gap-1 overflow-x-auto rounded-xl border bg-white p-1">
        {sections.map((item) => (
          <Button
            key={item.key}
            variant={section === item.key ? "default" : "ghost"}
            size="sm"
            className="shrink-0"
            onClick={() => setSection(item.key)}
          >
            <item.icon className="mr-1.5 size-4" />
            {item.label}
          </Button>
        ))}
      </div>

      {section === "central" && (
        <BalancesDataTable
          data={centralBalances.results}
          status={centralBalances.status}
          onLoadMore={() => centralBalances.loadMore(100)}
          showLocation
          canEditLocation={access.canWriteCentral}
          quantityLabel="Saldo"
          searchPlaceholder="Buscar material ou localização"
          emptyMessage="Nenhum material no estoque central."
        />
      )}

      {section === "movimentacoes" && (
        <Card>
          <CardHeader>
            <CardTitle>Histórico de movimentações</CardTitle>
          </CardHeader>
          <CardContent>
            <InventoryDocumentsHistory access={access} documents={documents} />
          </CardContent>
        </Card>
      )}

      {section === "pedidos" && (
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Aguardando envio</h2>
            <ObraMaterialRequests
              access={access}
              projects={projects}
              requests={materialRequests.filter(
                (request) => request.status === "approved"
              )}
              emptyText="Nenhum pedido aprovado aguardando envio."
            />
          </section>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Aguardando validação</h2>
            <ObraMaterialRequests
              access={access}
              projects={projects}
              requests={materialRequests.filter(
                (request) => request.status === "pending"
              )}
              emptyText="Nenhum pedido pendente de engenharia."
            />
          </section>
        </div>
      )}

      {section === "aprovacoes" && (
        <InventoryApprovals approvals={approvals} />
      )}

      {section === "regras" && (
        <InventoryRules
          rules={rules}
          materials={materials}
          canConfigure={access.canConfigureRules}
        />
      )}
    </div>
  );
}
