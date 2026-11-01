import { usePaginatedQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Loader2 } from "lucide-react";

import { StatusBadge } from "@/components/engenharia/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** Serviços e cadastros do usuário logado nesta obra. */
export function ObraActivityList({
  projectId,
  obraSlug,
}: {
  projectId: Id<"projects">;
  obraSlug: string;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.technicianActivity.listMineForProject,
    { projectId },
    { initialNumItems: 20 }
  );

  if (status === "LoadingFirstPage") {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Carregando registros...
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Você ainda não registrou nada nesta obra. Os serviços que registrar
        aqui aparecem nesta lista.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {results.map((item) => {
        const body = (
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{item.label}</Badge>
                {item.status && <StatusBadge status={item.status} />}
              </div>
              <p className="truncate text-sm font-medium">{item.title}</p>
              {item.notes && (
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {item.notes}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {new Date(item.createdAt).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {item.qrToken && (
                  <>
                    {" · "}
                    <span className="font-mono">{item.qrToken}</span>
                  </>
                )}
              </p>
            </div>
            {item.qrToken && (
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
            )}
          </div>
        );
        if (!item.qrToken) {
          return <div key={`${item.kind}:${item.id}`}>{body}</div>;
        }
        return (
          <Link
            key={`${item.kind}:${item.id}`}
            to="/qr-operador/obras/$obraSlug/etiqueta/$token"
            params={{ obraSlug, token: item.qrToken }}
            className="block transition-colors hover:[&>div]:border-primary/40 hover:[&>div]:bg-muted/40"
          >
            {body}
          </Link>
        );
      })}

      {status === "CanLoadMore" && (
        <Button variant="outline" className="w-full" onClick={() => loadMore(20)}>
          Carregar mais
        </Button>
      )}
      {status === "LoadingMore" && (
        <Button variant="outline" className="w-full" disabled>
          <Loader2 className="animate-spin" />
          Carregando...
        </Button>
      )}
    </div>
  );
}
