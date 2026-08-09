import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatDate } from "@rlpapp/shared";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ArrowRight, Calculator, ExternalLink, Package } from "lucide-react";

import { AuthShell } from "@/components/auth-shell";
import { ProjectShell } from "@/components/engenharia/project-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useObraProjectId } from "@/lib/engenharia/obra-context";
import { obraLinkSlug } from "@/lib/engenharia/obra-paths";

export const Route = createFileRoute("/engenharia/obras/$obraSlug/compras")({
  component: ComprasPage,
});

function ComprasPage() {
  const projectId = useObraProjectId();
  return (
    <AuthShell>
      <ProjectShell projectId={projectId}>
        {(project) => (
          <ComprasContent
            projectId={projectId as Id<"projects">}
            obraSlug={obraLinkSlug(project)}
          />
        )}
      </ProjectShell>
    </AuthShell>
  );
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  pricing: "Em precificação",
  quoted: "Cotado",
  approved: "Aprovado",
  archived: "Arquivado",
};

function ComprasContent({
  projectId,
  obraSlug,
}: {
  projectId: Id<"projects">;
  obraSlug: string;
}) {
  const takeoffs = useQuery(api.takeoffs.list, { projectId });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Compras da obra</h2>
          <p className="text-sm text-muted-foreground">
            Takeoffs deste projeto e atalhos para o departamento de Compras.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            render={
              <Link
                to="/engenharia/obras/$obraSlug/orcamento"
                params={{ obraSlug }}
              />
            }
          >
            <Calculator className="mr-1.5 size-4" />
            Abrir orçamento
          </Button>
          <Button
            variant="outline"
            size="sm"
            render={<Link to="/compras/takeoffs" />}
          >
            <ExternalLink className="mr-1.5 size-4" />
            Takeoffs gerais
          </Button>
          <Button
            variant="outline"
            size="sm"
            render={<Link to="/compras/materiais" />}
          >
            <Package className="mr-1.5 size-4" />
            Materiais
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Takeoffs do projeto</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {takeoffs === undefined ? (
            <p className="px-6 py-8 text-sm text-muted-foreground">
              Carregando...
            </p>
          ) : takeoffs.length === 0 ? (
            <div className="space-y-3 px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                Nenhum takeoff nesta obra ainda. Crie um no orçamento para
                começar a acompanhar compras.
              </p>
              <Button
                render={
                  <Link
                    to="/engenharia/obras/$obraSlug/orcamento"
                    params={{ obraSlug }}
                  />
                }
              >
                Ir para orçamento
                <ArrowRight className="ml-1.5 size-4" />
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Itens</TableHead>
                  <TableHead>Atualizado</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {takeoffs.map((t) => (
                  <TableRow key={t._id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>
                      {t.status ? (
                        <Badge variant="secondary">
                          {STATUS_LABELS[t.status] ?? t.status}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.itemCount}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(t.updatedAt ?? t.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        render={
                          <Link
                            to="/engenharia/obras/$obraSlug/orcamento"
                            params={{ obraSlug }}
                          />
                        }
                      >
                        Abrir
                        <ArrowRight className="ml-1 size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
