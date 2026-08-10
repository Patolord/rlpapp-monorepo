import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { usePaginatedQuery, useQuery } from "convex/react";
import { History, Package, Search, Warehouse } from "lucide-react";
import { useMemo, useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import { StockHealthBadge } from "@/components/compras/material-replenishment-badge";
import { InventoryDocumentsHistory } from "@/components/estoque/inventory-documents-history";
import { InventoryMovementDialog } from "@/components/estoque/inventory-movement-dialog";
import {
  ProjectShell,
  type ProjectOverview,
} from "@/components/engenharia/project-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

function ObraEstoqueContent({
  project,
  projectId,
}: {
  project: ProjectOverview;
  projectId: Id<"projects">;
}) {
  const access = useQuery(api.inventory.getAccess, {});
  const materials = useQuery(api.inventory.listMaterialOptions, {});
  const projects = useQuery(api.inventory.listProjects, {});
  const summaries = useQuery(api.inventory.listProjectSummaries, {});
  const balances = usePaginatedQuery(
    api.inventory.listBalances,
    { projectId },
    { initialNumItems: 100 }
  );
  const documents = usePaginatedQuery(
    api.inventory.listDocuments,
    { projectId },
    { initialNumItems: 20 }
  );

  const [section, setSection] = useState<Section>("saldos");
  const [search, setSearch] = useState("");

  const summary = summaries?.find((item) => item.projectId === projectId);

  const filteredBalances = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return balances.results;
    return balances.results.filter(
      (balance) =>
        balance.materialName.toLocaleLowerCase("pt-BR").includes(term) ||
        balance.materialSku?.toLocaleLowerCase("pt-BR").includes(term) ||
        balance.category?.toLocaleLowerCase("pt-BR").includes(term)
    );
  }, [balances.results, search]);

  if (!access || !materials || !projects || !summaries) {
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
          materials={materials}
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
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Materiais na obra</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Saldos disponíveis neste projeto.
                </p>
              </div>
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar material"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {balances.status === "LoadingFirstPage" ? (
              <LoadingMessage />
            ) : filteredBalances.length === 0 ? (
              <EmptyMessage text="Esta obra ainda não possui materiais." />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Disponível</TableHead>
                      <TableHead>Saúde</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBalances.map((balance) => (
                      <TableRow key={balance._id}>
                        <TableCell className="font-medium">
                          <div>
                            <p>{balance.materialName}</p>
                            {balance.materialSku && (
                              <p className="text-xs text-muted-foreground">
                                {balance.materialSku}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{balance.category ?? "—"}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {balance.quantity} {balance.unit ?? ""}
                        </TableCell>
                        <TableCell>
                          <StockHealthBadge
                            state={balance.replenishmentState}
                            suggestedOrderQuantity={
                              balance.suggestedOrderQuantity
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {balances.status === "CanLoadMore" && (
                  <div className="mt-4 text-center">
                    <Button
                      variant="outline"
                      onClick={() => balances.loadMore(100)}
                    >
                      Carregar mais
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
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

function LoadingMessage() {
  return (
    <p className="py-12 text-center text-sm text-muted-foreground">
      Carregando...
    </p>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return (
    <p className="py-12 text-center text-sm text-muted-foreground">{text}</p>
  );
}
