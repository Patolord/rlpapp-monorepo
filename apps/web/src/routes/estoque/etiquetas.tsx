import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { usePaginatedQuery, useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";

import { AuthShell } from "@/components/auth-shell";
import { ShelfLabelPicker } from "@/components/estoque/shelf-label-picker";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/estoque/etiquetas")({
  component: () => (
    <AuthShell>
      <EtiquetasPage />
    </AuthShell>
  ),
});

const PAGE_SIZE = 500;

/** Etiquetas de prateleira do estoque central (QR com o SKU, nome e endereço). */
function EtiquetasPage() {
  const access = useQuery(api.inventory.getAccess, {});
  const canView = access?.canViewCentral === true;
  const { results, status, loadMore } = usePaginatedQuery(
    api.inventory.listShelfLabels,
    canView ? {} : "skip",
    { initialNumItems: PAGE_SIZE }
  );

  // Baixa o central inteiro: o filtro por endereço precisa de todos os itens.
  useEffect(() => {
    if (status === "CanLoadMore") loadMore(PAGE_SIZE);
  }, [status, loadMore]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="mt-0.5 shrink-0"
          render={<Link to="/estoque" />}
          aria-label="Voltar ao estoque central"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Etiquetas de prateleira</h1>
          <p className="text-sm text-muted-foreground">
            Cole na prateleira ou na caixa onde o item fica. O QR tem o SKU: no app, Estoque › Cadastro › Ler código
            abre o item direto, mesmo solto e sem embalagem.
          </p>
        </div>
      </div>

      {access === undefined ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : !canView ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          As etiquetas de prateleira são do estoque central (equipes de Estoque e Compras).
        </p>
      ) : (
        <ShelfLabelPicker rows={results} loading={status !== "Exhausted"} />
      )}
    </div>
  );
}
