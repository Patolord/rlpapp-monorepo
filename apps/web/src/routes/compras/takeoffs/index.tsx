import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ExternalLink } from "lucide-react";

import { AuthShell } from "@/components/auth-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { obraLinkSlug } from "@/lib/engenharia/obra-paths";

export const Route = createFileRoute("/compras/takeoffs/")({
  component: TakeoffsSupportPage,
});

function TakeoffsSupportPage() {
  return (
    <AuthShell>
      <TakeoffsSupportContent />
    </AuthShell>
  );
}

function TakeoffsSupportContent() {
  const takeoffs = useQuery(api.takeoffs.list, {});

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Takeoffs</h1>
        <p className="text-sm text-muted-foreground">
          Visão de apoio da Compras. Orçamentos são criados pela Engenharia nas obras.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Takeoffs registrados</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Obra</TableHead>
                <TableHead>Itens</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(takeoffs ?? []).map((t) => (
                <TableRow key={t._id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>{t.projectName ?? "—"}</TableCell>
                  <TableCell>{t.itemCount}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{t.status ?? "draft"}</Badge>
                  </TableCell>
                  <TableCell>
                    {t.projectId ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        render={
                          <Link
                            to="/engenharia/obras/$obraSlug/orcamento"
                            params={{
                              obraSlug: obraLinkSlug({
                                slug: t.projectSlug,
                                _id: t.projectId,
                              }),
                            }}
                          />
                        }
                      >
                        <ExternalLink className="mr-1 size-4" />
                        Ver orçamento
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
