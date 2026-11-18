import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import { QuoteProposalDialog } from "@/components/compras/quote-proposal-dialog";
import { QuoteWeekMap } from "@/components/compras/quote-week-map";
import { Button } from "@/components/ui/button";
import { useCan } from "@/hooks/use-can";
import { formatWeekRange, fromWeekParam, shiftWeekParam } from "@/lib/quote-weeks";

export const Route = createFileRoute("/compras/cotacoes/$semana")({
  component: SemanaPage,
});

function SemanaPage() {
  return (
    <AuthShell>
      <SemanaContent />
    </AuthShell>
  );
}

function SemanaContent() {
  const { semana } = Route.useParams();
  const weekStart = fromWeekParam(semana);
  const [now] = useState(() => Date.now());
  const week = useQuery(api.quoteProposals.week, weekStart === null ? "skip" : { weekStart, now });
  const canRecord = useCan("precos.write");
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (weekStart === null) {
    return <p className="p-6 text-sm text-muted-foreground">Semana inválida: use aaaa-mm-dd.</p>;
  }
  const previous = shiftWeekParam(semana, -1)!;
  const next = shiftWeekParam(semana, 1)!;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <nav aria-label="Caminho" className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <Link to="/compras/cotacoes" className="hover:text-foreground">
          Cotações
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span className="text-foreground">Semana de {formatWeekRange(weekStart)}</span>
      </nav>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Rodada da semana de {formatWeekRange(weekStart)}</h1>
          <p className="text-sm text-muted-foreground">
            {week
              ? `${week.columns.length} ${week.columns.length === 1 ? "fornecedor" : "fornecedores"} · ${week.rows.length} ${week.rows.length === 1 ? "item" : "itens"}`
              : "Carregando…"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            render={<Link to="/compras/cotacoes/$semana" params={{ semana: previous }} />}
          >
            <ChevronLeft />
            Semana anterior
          </Button>
          <Button
            variant="outline"
            render={<Link to="/compras/cotacoes/$semana" params={{ semana: next }} />}
          >
            Próxima
            <ChevronRight />
          </Button>
          {canRecord ? (
            <Button onClick={() => setOpen(true)}>
              <Plus />
              Registrar proposta
            </Button>
          ) : null}
        </div>
      </div>

      {week === undefined ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <QuoteWeekMap week={week} now={now} />
      )}

      {canRecord ? (
        <QuoteProposalDialog
          open={open}
          onOpenChange={setOpen}
          onCreated={(semanaCriada) =>
            void navigate({ to: "/compras/cotacoes/$semana", params: { semana: semanaCriada } })
          }
        />
      ) : null}
    </div>
  );
}
