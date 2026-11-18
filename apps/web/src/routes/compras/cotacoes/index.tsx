import { api } from "@rlpapp/backend/convex/_generated/api";
import { formatDate } from "@rlpapp/shared";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import { QuoteProposalDialog } from "@/components/compras/quote-proposal-dialog";
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
import { useCan } from "@/hooks/use-can";
import { endOfTodayBrt, formatWeekRange, toWeekParam } from "@/lib/quote-weeks";

export const Route = createFileRoute("/compras/cotacoes/")({
  component: CotacoesPage,
});

const FREIGHT_LABEL = { cif: "CIF", fob: "FOB" } as const;

function CotacoesPage() {
  return (
    <AuthShell>
      <CotacoesContent />
    </AuthShell>
  );
}

function CotacoesContent() {
  const [now] = useState(() => endOfTodayBrt());
  // Páginas de semanas: cada cursor é o `before` de uma página (undefined = a mais recente).
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);
  const before = cursors[cursors.length - 1];
  const page = useQuery(api.quoteProposals.listWeeks, { now, limit: 20, before });
  const weeks = page?.weeks;
  const proposals = useQuery(api.quoteProposals.list, { limit: 20 });
  const canRecord = useCan("precos.write");
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Cotações</h1>
          <p className="text-sm text-muted-foreground">
            Cada semana (segunda a domingo) é uma rodada: os preços que chegaram nela são comparados lado a lado,
            por fornecedor.
          </p>
        </div>
        {canRecord ? (
          <Button onClick={() => setOpen(true)}>
            <Plus />
            Registrar proposta
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Semanas com preços</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {weeks === undefined ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : weeks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum preço registrado ainda. Registre a proposta de um fornecedor para começar.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Semana</TableHead>
                  <TableHead className="text-right">Fornecedores</TableHead>
                  <TableHead className="text-right">Materiais</TableHead>
                  <TableHead className="text-right">Preços</TableHead>
                  <TableHead className="text-right">Propostas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {weeks.map((week) => (
                  <TableRow key={week.weekStart}>
                    <TableCell>
                      <Link
                        to="/compras/cotacoes/$semana"
                        params={{ semana: toWeekParam(week.weekStart) }}
                        className="font-medium text-primary hover:underline"
                      >
                        {formatWeekRange(week.weekStart)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{week.supplierCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{week.materialCount}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {week.priceCount}
                      {week.truncated ? "+" : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{week.proposalCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {cursors.length > 1 || page?.continueBefore ? (
            <div className="mt-3 flex justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={cursors.length === 1}
                onClick={() => setCursors(cursors.slice(0, -1))}
              >
                Mais recentes
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!page?.continueBefore}
                onClick={() => page?.continueBefore && setCursors([...cursors, page.continueBefore])}
              >
                Semanas anteriores
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Propostas recentes</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {proposals === undefined ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : proposals.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma proposta registrada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recebida</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Nº</TableHead>
                  <TableHead>Válida até</TableHead>
                  <TableHead>Condição</TableHead>
                  <TableHead>Semana</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proposals.map((proposal) => (
                  <TableRow key={proposal._id}>
                    <TableCell className="tabular-nums">{formatDate(proposal.receivedAt)}</TableCell>
                    <TableCell className="font-medium">{proposal.supplierName}</TableCell>
                    <TableCell>{proposal.reference ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">
                      {proposal.validUntil ? formatDate(proposal.validUntil) : "—"}
                    </TableCell>
                    <TableCell>
                      {[proposal.paymentTerms, proposal.freight ? `frete ${FREIGHT_LABEL[proposal.freight]}` : null]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/compras/cotacoes/$semana"
                        params={{ semana: toWeekParam(proposal.weekStart) }}
                        className="text-primary hover:underline"
                      >
                        {formatWeekRange(proposal.weekStart)}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {canRecord ? (
        <QuoteProposalDialog
          open={open}
          onOpenChange={setOpen}
          onCreated={(semana) => void navigate({ to: "/compras/cotacoes/$semana", params: { semana } })}
        />
      ) : null}
    </div>
  );
}
