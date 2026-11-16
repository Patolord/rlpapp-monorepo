import { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { createFileRoute } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { formatDate } from "@rlpapp/shared";
import { ExternalLink, FileText, Folder, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import { PermissionGate } from "@/components/role-area-gate";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type Overview = FunctionReturnType<typeof api.sharepoint.trelloOverview>;

/**
 * Acompanhamento da pasta TRELLO de orçamentos no SharePoint
 * (Projetos/z/Orçamentos/TRELLO): quantos itens há em cada etapa.
 * Lido direto do SharePoint a cada abertura (action, não é reativo).
 */
function OrcamentosTrelloPage() {
  const loadOverview = useAction(api.sharepoint.trelloOverview);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOverview(await loadOverview({}));
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível ler a pasta no SharePoint."));
    } finally {
      setLoading(false);
    }
  }, [loadOverview]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Orçamentos (TRELLO)</h1>
          <p className="text-sm text-muted-foreground">
            Itens em cada etapa da pasta Orçamentos/TRELLO do SharePoint.
          </p>
        </div>
        <div className="flex gap-2">
          {overview?.webUrl && (
            <a
              href={overview.webUrl}
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

      {!overview && loading && (
        <p className="text-sm text-muted-foreground">Lendo a pasta no SharePoint…</p>
      )}

      {overview && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {overview.stages.map((stage) => (
              <Card key={stage.name}>
                <CardContent className="space-y-1 py-4">
                  <p className="truncate text-sm text-muted-foreground" title={stage.name}>
                    {stage.name}
                  </p>
                  <p className="text-3xl font-semibold tabular-nums">{stage.count}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {overview.stages
            .filter((stage) => stage.items && stage.items.length > 0)
            .map((stage) => (
              <Card key={stage.name}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {stage.name} <span className="text-muted-foreground">({stage.count})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y">
                    {stage.items!.map((item) => (
                      <li key={item.name} className="flex items-center gap-3 py-2 text-sm">
                        {item.kind === "folder" ? (
                          <Folder className="size-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <FileText className="size-4 shrink-0 text-muted-foreground" />
                        )}
                        {item.webUrl ? (
                          <a
                            href={item.webUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="min-w-0 flex-1 truncate hover:underline"
                          >
                            {item.name}
                          </a>
                        ) : (
                          <span className="min-w-0 flex-1 truncate">{item.name}</span>
                        )}
                        {item.modifiedAt && (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {formatDate(item.modifiedAt)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
        </>
      )}
    </div>
  );
}
