import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { usePaginatedQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { ChevronRight, Loader2, MapPin, QrCode, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/engenharia/status-badge";

type QrFilter = "all" | "registered" | "free";

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}


export function ProjectQrList({
  projectId,
  qrCount,
  registeredCount,
  obraSlug,
}: {
  projectId: Id<"projects">;
  qrCount: number | null;
  registeredCount: number | null;
  /** Com a obra aberta no app de campo, a etiqueta abre dentro dela. */
  obraSlug?: string;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<QrFilter>("all");
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const { results, status, loadMore } = usePaginatedQuery(
    api.technicianPortal.listBrowsableQrsByProject,
    { projectId, search: debouncedSearch || undefined, filter },
    { initialNumItems: 20 }
  );
  const searching = debouncedSearch.length > 0;
  const filterOptions: Array<{ id: QrFilter; label: string; count: number | null }> = [
    { id: "all", label: "Todas", count: qrCount },
    { id: "registered", label: "Cadastradas", count: registeredCount },
    {
      id: "free",
      label: "Livres",
      count:
        qrCount !== null && registeredCount !== null
          ? qrCount - registeredCount
          : null,
    },
  ];
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar código, ambiente ou equipamento"
          className="h-11 pl-9"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {filterOptions.map((option) => (
          <Button
            key={option.id}
            type="button"
            size="sm"
            variant={filter === option.id ? "default" : "outline"}
            aria-pressed={filter === option.id}
            onClick={() => setFilter(option.id)}
          >
            {option.label}
            {option.count !== null && (
              <span className="ml-1 tabular-nums opacity-80">
                ({option.count})
              </span>
            )}
          </Button>
        ))}
      </div>

      {status === "LoadingFirstPage" ? (
        <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" />
          Carregando etiquetas...
        </div>
      ) : results.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {searching
            ? "Nenhuma etiqueta corresponde à busca."
            : filter === "registered"
              ? "Nenhuma etiqueta cadastrada nesta obra."
              : filter === "free"
                ? "Nenhuma etiqueta livre nesta obra."
                : "Nenhuma etiqueta ativa nesta obra."}
        </p>
      ) : (
        <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
          {results.map((qr) => {
            const title =
              qr.description ||
              [qr.modelo, qr.ambiente].filter(Boolean).join(" · ") ||
              "Etiqueta ainda sem equipamento";
            return (
              <Link
                key={qr._id}
                {...(obraSlug
                  ? {
                      to: "/qr-operador/obras/$obraSlug/etiqueta/$token",
                      params: { obraSlug, token: qr.token },
                    }
                  : { to: "/q/$token", params: { token: qr.token } })}
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-muted/40"
              >
                <div className="rounded-md bg-primary/10 p-2">
                  <QrCode className="size-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold">
                      {qr.token}
                    </span>
                    {qr.status ? (
                      <StatusBadge status={qr.status} />
                    ) : (
                      <Badge variant="outline">Livre</Badge>
                    )}
                  </div>
                  <p className="truncate text-sm">{title}</p>
                  {qr.ambiente && (
                    <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <MapPin className="size-3" />
                      {qr.ambiente}
                    </p>
                  )}
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      )}

      {status === "CanLoadMore" && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => loadMore(20)}
        >
          Carregar mais etiquetas
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
