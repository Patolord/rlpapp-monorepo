import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { formatCurrency } from "@rlpapp/shared";
import { ChevronRight, CircleDollarSign } from "lucide-react";

import { AuthShell } from "@/components/auth-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { obraLinkSlug } from "@/lib/engenharia/obra-paths";

export const Route = createFileRoute("/engenharia/medicoes")({
  component: () => (
    <AuthShell>
      <MedicoesOverviewPage />
    </AuthShell>
  ),
});

const PROJECT_STATUS_LABELS: Record<string, string> = {
  planning: "Planejamento",
  in_progress: "Em andamento",
  completed: "Concluída",
  paused: "Pausada",
};

function MedicoesOverviewPage() {
  const overview = useQuery(api.medicoes.getOverview);

  const totals = (overview ?? []).reduce(
    (acc, row) => ({
      contratado: acc.contratado + row.contractTotalCents,
      medido: acc.medido + row.medidoCents,
      pago: acc.pago + row.pagoCents,
    }),
    { contratado: 0, medido: 0, pago: 0 }
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Medições</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe os contratos e as cobranças por serviços realizados em cada
          obra.
        </p>
      </div>

      {overview !== undefined && overview.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <SummaryCard label="Total contratado" value={totals.contratado} />
          <SummaryCard label="Total medido" value={totals.medido} />
          <SummaryCard
            label="Total pago"
            value={totals.pago}
            valueClassName="text-green-700"
          />
        </div>
      )}

      {overview === undefined ? (
        <Card className="h-64 animate-pulse" />
      ) : overview.length === 0 ? (
        <EmptyState />
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Obra</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Contratado</TableHead>
                  <TableHead className="text-right">Medido</TableHead>
                  <TableHead className="text-right">Aprovado</TableHead>
                  <TableHead className="text-right">Pago</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-right">% Faturado</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.map((row) => {
                  const pct =
                    row.contractTotalCents > 0
                      ? Math.round(
                          (row.medidoCents / row.contractTotalCents) * 100
                        )
                      : 0;
                  return (
                    <TableRow key={row.projectId} className="group">
                      <TableCell>
                        <Link
                          to="/engenharia/obras/$obraSlug/medicoes"
                          params={{
                            obraSlug: obraLinkSlug({
                              slug: row.projectSlug,
                              _id: row.projectId,
                            }),
                          }}
                          className="block"
                        >
                          <div className="font-medium group-hover:underline">
                            {row.legacyNumber ? `#${row.legacyNumber} · ` : ""}
                            {row.projectName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {row.client ?? "—"}
                            {row.contractCount > 0 &&
                              ` · ${row.contractCount} contrato${row.contractCount === 1 ? "" : "s"}`}
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell>
                        {row.status ? (
                          <Badge variant="outline" className="font-normal">
                            {PROJECT_STATUS_LABELS[row.status] ?? row.status}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.contractTotalCents > 0
                          ? formatCurrency(row.contractTotalCents)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(row.medidoCents)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(row.aprovadoCents)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-green-700">
                        {formatCurrency(row.pagoCents)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${
                          row.saldoCents < 0 ? "text-red-600" : ""
                        }`}
                      >
                        {row.contractTotalCents > 0
                          ? formatCurrency(row.saldoCents)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.contractTotalCents > 0 ? `${pct}%` : "—"}
                      </TableCell>
                      <TableCell>
                        <Link
                          to="/engenharia/obras/$obraSlug/medicoes"
                          params={{
                            obraSlug: obraLinkSlug({
                              slug: row.projectSlug,
                              _id: row.projectId,
                            }),
                          }}
                          aria-label={`Medições de ${row.projectName}`}
                        >
                          <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: number;
  valueClassName?: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 py-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold tabular-nums ${valueClassName ?? ""}`}>
          {formatCurrency(value)}
        </p>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CircleDollarSign className="size-7" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Nenhuma obra cadastrada</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Crie uma obra em Obras e cadastre o contrato para começar a
            registrar medições.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
