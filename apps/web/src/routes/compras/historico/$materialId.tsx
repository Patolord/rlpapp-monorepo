import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ChevronRight, Plus } from "lucide-react";
import { useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import { FamilyPriceHistory } from "@/components/compras/family-price-history";
import { QuoteProposalDialog } from "@/components/compras/quote-proposal-dialog";
import { Button } from "@/components/ui/button";
import { useCan } from "@/hooks/use-can";

export const Route = createFileRoute("/compras/historico/$materialId")({
  component: HistoricoPage,
});

function HistoricoPage() {
  return (
    <AuthShell>
      <HistoricoContent />
    </AuthShell>
  );
}

function HistoricoContent() {
  const { materialId } = Route.useParams();
  const id = materialId as Id<"materials">;
  const material = useQuery(api.materials.get, { materialId: id });
  const family = useQuery(
    api.materials.listFamilies,
    material?.familyId ? { activeOnly: false } : "skip"
  );
  const canRecord = useCan("precos.write");
  const navigate = useNavigate();
  const [proposalOpen, setProposalOpen] = useState(false);

  if (material === undefined) {
    return <p className="p-6 text-sm text-muted-foreground">Carregando…</p>;
  }
  if (material === null) {
    return <p className="p-6 text-sm text-muted-foreground">Material não encontrado.</p>;
  }
  const familyName = family?.find((f) => f._id === material.familyId)?.name ?? null;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <nav aria-label="Caminho" className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <Link to="/compras/materiais" className="hover:text-foreground">
          Materiais
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span className="text-foreground">{familyName ?? material.name}</span>
      </nav>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{familyName ?? material.name}</h1>
          <p className="text-sm text-muted-foreground">
            Histórico de preços de todas as variantes e fornecedores. A referência é a mediana das cotações dos
            últimos 6 meses; até 10% de dispersão dá para orçar sem cotar de novo.
          </p>
        </div>
        {canRecord ? (
          <Button onClick={() => setProposalOpen(true)}>
            <Plus />
            Registrar proposta
          </Button>
        ) : null}
      </div>

      <FamilyPriceHistory materialId={id} />

      {canRecord ? (
        <QuoteProposalDialog
          open={proposalOpen}
          onOpenChange={setProposalOpen}
          initialMaterialId={id}
          onCreated={(semana) => void navigate({ to: "/compras/cotacoes/$semana", params: { semana } })}
        />
      ) : null}
    </div>
  );
}
