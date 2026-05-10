import { useState, useCallback } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  QrCode,
  Wrench,
  Plus,
  Printer,
  Loader2,
  Link2,
  Link2Off,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { ConvexUnauthRedirect } from "@/components/convex-unauth-redirect";

export const Route = createFileRoute("/engenharia/")({
  component: EngenhariaPage,
});

function EngenhariaPage() {
  return (
    <>
      <Authenticated>
        <PageContent />
      </Authenticated>
      <Unauthenticated>
        <ConvexUnauthRedirect />
      </Unauthenticated>
      <AuthLoading>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </AuthLoading>
    </>
  );
}

type FilterMode = "all" | "linked" | "free" | "latest_batch";

function PageContent() {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 6;

  const qrCodes = useQuery(api.qrCodes.listWithEquipment, { filter });
  const equipmentList = useQuery(api.equipment.list);

  const allQrCodes = useQuery(api.qrCodes.list);
  const totalQr = allQrCodes?.length ?? 0;
  const linkedQr = allQrCodes?.filter((q) => q.equipmentId).length ?? 0;
  const freeQr = totalQr - linkedQr;

  const totalEquipment = equipmentList?.length ?? 0;
  const operational =
    equipmentList?.filter((e) => e.status === "operational").length ?? 0;
  const warnings =
    equipmentList?.filter((e) => e.status === "warning").length ?? 0;
  const errors =
    equipmentList?.filter((e) => e.status === "error").length ?? 0;

  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://app.rlp.com";

  const toggleSelect = useCallback((token: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(token)) {
        next.delete(token);
      } else {
        next.add(token);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (!qrCodes) return;
    setSelected((prev) => {
      if (prev.size === qrCodes.length) return new Set();
      return new Set(qrCodes.map((q) => q.token));
    });
  }, [qrCodes]);

  const selectedTokens = qrCodes
    ? qrCodes.filter((q) => selected.has(q.token))
    : [];

  const usePagination = filter === "all";
  const totalPages = qrCodes
    ? Math.ceil(qrCodes.length / ITEMS_PER_PAGE)
    : 0;
  const displayedQrCodes = qrCodes
    ? usePagination
      ? qrCodes.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)
      : qrCodes
    : [];

  return (
    <div>
      {/* Print-only area: only selected QR codes */}
      {selectedTokens.length > 0 && (
        <div className="hidden print:block print:overflow-visible">
          <div className="grid grid-cols-3 gap-4">
            {selectedTokens.map((qr) => (
              <div
                key={qr.token}
                className="flex flex-col items-center rounded-lg border-2 border-gray-300 bg-white p-4 text-center break-inside-avoid"
              >
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                  RLP Engenharia
                </p>
                <p className="mb-2 font-mono text-sm font-bold text-black">
                  {qr.token}
                </p>
                <QRCodeSVG
                  value={`${baseUrl}/q/${qr.token}`}
                  size={120}
                  level="M"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Screen-only content */}
      <div className="mx-auto max-w-4xl space-y-6 print:hidden">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">QR Codes</h1>

          </div>
          <Button render={<Link to="/engenharia/qr-codes" />}>
            <Plus className="mr-2 h-4 w-4" />
            Criar QR Codes
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Equipamentos
              </CardTitle>
              <Wrench className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalEquipment}</div>
              <p className="text-xs text-muted-foreground">
                {operational} operacionais
                {warnings > 0 && `, ${warnings} alertas`}
                {errors > 0 && `, ${errors} erros`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Total QR Codes
              </CardTitle>
              <QrCode className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalQr}</div>
              <p className="text-xs text-muted-foreground">códigos gerados</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Vinculados</CardTitle>
              <Link2 className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{linkedQr}</div>
              <p className="text-xs text-muted-foreground">
                com equipamento vinculado
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Livres</CardTitle>
              <Link2Off className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{freeQr}</div>
              <p className="text-xs text-muted-foreground">
                disponíveis para vínculo
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            Filtrar:
          </span>
          {(["all", "linked", "free", "latest_batch"] as const).map((mode) => (
            <Button
              key={mode}
              variant={filter === mode ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setFilter(mode);
                setSelected(new Set());
                setPage(1);
              }}
            >
              {mode === "all"
                ? "Todos"
                : mode === "linked"
                  ? "Vinculados"
                  : mode === "free"
                    ? "Livres"
                    : "Últimos Gerados"}
            </Button>
          ))}
        </div>

        {/* Action bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
            <span className="text-sm font-medium">
              {selected.size} selecionado{selected.size > 1 ? "s" : ""}
            </span>
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
            >
              <Printer className="mr-2 h-4 w-4" />
              Imprimir Selecionados
            </Button>
          </div>
        )}

        {/* QR Codes List */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">QR Codes Existentes</h2>
            {qrCodes && qrCodes.length > 0 && (
              <Button variant="ghost" size="sm" onClick={toggleSelectAll}>
                {selected.size === qrCodes.length
                  ? "Desmarcar Todos"
                  : "Selecionar Todos"}
              </Button>
            )}
          </div>

          {qrCodes === undefined ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : qrCodes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {filter === "all"
                ? "Nenhum QR code gerado ainda."
                : filter === "linked"
                  ? "Nenhum QR code vinculado."
                  : filter === "free"
                    ? "Nenhum QR code livre."
                    : "Nenhum lote recente encontrado."}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {displayedQrCodes.map((qr) => (
                  <Card key={qr._id} className="relative">
                    <CardContent className="flex flex-col items-center gap-2 pt-4 pb-3">
                      <Checkbox
                        checked={selected.has(qr.token)}
                        onCheckedChange={() => toggleSelect(qr.token)}
                        className="absolute top-2 left-2"
                      />
                      <Link
                        to="/engenharia/qr/$token"
                        params={{ token: qr.token }}
                        className="flex flex-col items-center gap-2 cursor-pointer"
                      >
                        <QRCodeSVG
                          value={`${baseUrl}/q/${qr.token}`}
                          size={160}
                          level="M"
                        />
                        <p className="font-mono text-xs font-bold text-center">
                          {qr.token}
                        </p>
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {usePagination && totalPages > 1 && (
                <div className="mt-4 flex items-center justify-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page === 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (p) => (
                      <Button
                        key={p}
                        variant={p === page ? "default" : "outline"}
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </Button>
                    ),
                  )}
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page === totalPages}
                    onClick={() =>
                      setPage((p) => Math.min(totalPages, p + 1))
                    }
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
