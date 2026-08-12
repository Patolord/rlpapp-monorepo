import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { usePaginatedQuery, useQuery } from "convex/react";
import { History, Package, Warehouse } from "lucide-react";
import { useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import { BalancesDataTable } from "@/components/estoque/balances-table/balances-data-table";
import { InventoryDocumentsHistory } from "@/components/estoque/inventory-documents-history";
import { InventoryMovementDialog } from "@/components/estoque/inventory-movement-dialog";
import {
  ProjectShell,
  type ProjectOverview,
} from "@/components/engenharia/project-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useObraProjectId } from "@/lib/engenharia/obra-context";

export const Route = createFileRoute("/engenharia/obras/$obraSlug/estoque")({
  component: ObraEstoquePage,
});

type Section = "saldos" | "movimentacoes";

function ObraEstoquePage() {
  const projectId = useObraProjectId();
  return (
    <AuthShell>
      <ProjectShell projectId={projectId}>
        {(project) => (
          <ObraEstoqueContent
            project={project}
            projectId={projectId as Id<"projects">}
          />
        )}
      </ProjectShell>
    </AuthShell>
  );
}

function canReadEstoque(user: {
  role: string;
  department?: string | null;
}): boolean {
  return (
    user.role === "director" ||
    user.role === "admin" ||
    user.role === "engenheiro" ||
    user.department === "engenharia" ||
    user.department === "compras" ||
    user.department === "estoque"
  );
}

function ObraEstoqueContent({
  project,
  projectId,
}: {
  project: ProjectOverview;
  projectId: Id<"projects">;
}) {
  const currentUser = useQuery(api.users.getCurrentUser, {});
  const hasEstoqueRead =
    currentUser !== undefined &&
    currentUser !== null &&
    canReadEstoque(currentUser);
  const inventoryArgs = hasEstoqueRead ? {} : "skip";
  const projectInventoryArgs = hasEstoqueRead ? { projectId } : "skip";

  const access = useQuery(api.inventory.getAccess, inventoryArgs);
  const projects = useQuery(api.inventory.listProjects, inventoryArgs);
  const summaries = useQuery(
    api.inventory.listProjectSummaries,
    inventoryArgs
  );
  const balances = usePaginatedQuery(
    api.inventory.listBalances,
    projectInventoryArgs,
    { initialNumItems: 100 }
  );
  const documents = usePaginatedQuery(
    api.inventory.listDocuments,
    projectInventoryArgs,
    { initialNumItems: 20 }
  );

  const [section, setSection] = useState<Section>("saldos");

  const summary = summaries?.find((item) => item.projectId === projectId);

  if (currentUser === undefined) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        Carregando estoque da obra...
      </div>
    );
  }

  if (!hasEstoqueRead) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <h1 className="text-2xl font-bold">Acesso restrito</h1>
        <p className="mt-2 text-muted-foreground">
          Acesso restrito às áreas de estoque, compras ou engenharia.
        </p>
      </div>
    );
  }

  if (!access || !projects || !summaries) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        Carregando estoque da obra...
      </div>
    );
  }

  const sections: Array<{ key: Section; label: string; icon: typeof Package }> =
    [
      { key: "saldos", label: "Saldos", icon: Warehouse },
      { key: "movimentacoes", label: "Movimentações", icon: History },
    ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Estoque da obra</h2>
          <p className="text-sm text-muted-foreground">
            Materiais disponíveis e movimentações de {project.name}.
          </p>
        </div>
        <InventoryMovementDialog
          access={access}
          projects={projects}
          fixedProjectId={projectId}
          scope="obra"
        />
      </div>

      {summary && (
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            {summary.materialCount} material(is) com saldo
          </Badge>
          <Badge variant="secondary">{summary.transferCount} envios</Badge>
          <Badge variant="secondary">{summary.consumptionCount} consumos</Badge>
          <Badge variant="secondary">{summary.returnCount} retornos</Badge>
        </div>
      )}

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

      {section === "saldos" && (
        <BalancesDataTable
          data={balances.results}
          status={balances.status}
          onLoadMore={() => balances.loadMore(100)}
          showLocation={false}
          quantityLabel="Disponível"
          searchPlaceholder="Buscar material"
          emptyMessage="Esta obra ainda não possui materiais."
        />
      )}

      {section === "movimentacoes" && (
        <Card>
          <CardHeader>
            <CardTitle>Histórico de movimentações</CardTitle>
          </CardHeader>
          <CardContent>
            <InventoryDocumentsHistory
              access={access}
              documents={documents}
              showProjectName={false}
              emptyText="Nenhuma movimentação registrada para esta obra."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
