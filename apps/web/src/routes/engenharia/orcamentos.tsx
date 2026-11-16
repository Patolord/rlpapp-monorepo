import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import {
  OtherStages,
  TrelloBoard,
  type TrelloBoardData,
} from "@/components/engenharia/orcamentos/trello-board";
import { PermissionGate } from "@/components/role-area-gate";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/engenharia/orcamentos")({
  component: () => (
    <PermissionGate permissions={["arquivos.read"]}>
      <AuthShell>
        <OrcamentosTrelloPage />
      </AuthShell>
    </PermissionGate>
  ),
});

/**
 * Quadro dos orçamentos a partir da pasta TRELLO do SharePoint
 * (Projetos/z/Orçamentos/TRELLO). Lido direto do SharePoint a cada abertura
 * (action, não é reativo); "Atualizar" lê de novo.
 */
function OrcamentosTrelloPage() {
  const loadBoard = useAction(api.sharepoint.trelloBoard);
  const [board, setBoard] = useState<TrelloBoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBoard(await loadBoard({}));
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível ler a pasta TRELLO no SharePoint."));
    } finally {
      setLoading(false);
    }
  }, [loadBoard]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold">Orçamentos</h1>
          <p className="text-sm text-muted-foreground">
            O que está para fazer e em andamento na pasta TRELLO do SharePoint.
          </p>
          {board && <OtherStages stages={board.others} />}
        </div>
        <div className="flex gap-2">
          {board?.webUrl && (
            <a
              href={board.webUrl}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <ExternalLink className="size-4" />
              Abrir no SharePoint
            </a>
          )}
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {error && (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {!board && loading && (
        <p className="text-sm text-muted-foreground">Lendo a pasta no SharePoint…</p>
      )}

      {board && <TrelloBoard columns={board.columns} />}
    </div>
  );
}
