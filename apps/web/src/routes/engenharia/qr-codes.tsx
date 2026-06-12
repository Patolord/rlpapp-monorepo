import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft,
  Eye,
  ListChecks,
  Loader2,
  Plus,
  Printer,
  X,
} from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { printQrCodes } from "@/lib/qr-print";

export const Route = createFileRoute("/engenharia/qr-codes")({
  component: QrCodesPage,
});

function generateToken(length: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function QrCodesPage() {
  return (
    <AuthShell>
      <QrCodesContent />
    </AuthShell>
  );
}

function QrCodesContent() {
  const batchCreate = useMutation(api.qrCodes.batchCreate);
  const navigate = useNavigate();

  const [prefix, setPrefix] = useState("");
  const [batchName, setBatchName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [generating, setGenerating] = useState(false);
  const [newlyCreated, setNewlyCreated] = useState<string[]>([]);
  const [latestCreateBatch, setLatestCreateBatch] = useState<string | null>(null);
  const [latestCreateBatchName, setLatestCreateBatchName] = useState<string | null>(null);
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());
  const [previewToken, setPreviewToken] = useState<string | null>(null);

  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://app.rlp.com";

  const parsedQuantity = parseInt(quantity, 10);
  const isValidQuantity =
    !isNaN(parsedQuantity) && parsedQuantity > 0 && parsedQuantity <= 999;

  async function handleGenerate() {
    if (!isValidQuantity) return;
    setGenerating(true);
    try {
      const tokens: string[] = [];
      for (let i = 0; i < parsedQuantity; i++) {
        const token = prefix ? `${prefix}-${generateToken(6)}` : generateToken(8);
        tokens.push(token);
      }
      const result = await batchCreate({
        tokens,
        batchName: batchName.trim() || undefined,
      });
      const createdTokens = result.created.map((qr) => qr.token);
      setNewlyCreated(createdTokens);
      setLatestCreateBatch(result.batchId);
      setLatestCreateBatchName(result.batchName ?? null);
      setSelectedTokens(new Set(createdTokens));
      setPreviewToken(null);

      if (createdTokens.length === 0) {
        toast.error("Nenhum código QR novo foi criado");
      } else {
        toast.success(`${createdTokens.length} código(s) QR gerado(s)`);
      }
    } catch (err) {
      console.error("Failed to generate QR codes:", err);
      toast.error(err instanceof Error ? err.message : "Erro ao gerar códigos QR");
    } finally {
      setGenerating(false);
    }
  }

  function handlePrint() {
    if (newlyCreated.length === 0) return;

    printQrCodes({
      tokens: newlyCreated,
      baseUrl,
      title: latestCreateBatchName
        ? `Códigos QR ${latestCreateBatchName} - RLP Engenharia`
        : latestCreateBatch
          ? `Códigos QR ${latestCreateBatch} - RLP Engenharia`
        : "Códigos QR - RLP Engenharia",
    });
  }

  function handlePrintOne(token: string) {
    printQrCodes({
      tokens: [token],
      baseUrl,
      title: `Código QR ${token} - RLP Engenharia`,
    });
  }

  function handlePrintSelected() {
    const tokens = newlyCreated.filter((token) => selectedTokens.has(token));
    if (tokens.length === 0) return;

    printQrCodes({
      tokens,
      baseUrl,
      title: latestCreateBatchName
        ? `Códigos QR selecionados ${latestCreateBatchName} - RLP Engenharia`
        : latestCreateBatch
          ? `Códigos QR selecionados ${latestCreateBatch} - RLP Engenharia`
        : "Códigos QR selecionados - RLP Engenharia",
    });
  }

  function toggleToken(token: string) {
    setSelectedTokens((current) => {
      const next = new Set(current);
      if (next.has(token)) {
        next.delete(token);
      } else {
        next.add(token);
      }
      return next;
    });
  }

  function toggleAllCreated() {
    setSelectedTokens((current) => {
      if (newlyCreated.every((token) => current.has(token))) {
        return new Set();
      }
      return new Set(newlyCreated);
    });
  }

  const selectedCreatedCount = newlyCreated.filter((token) =>
    selectedTokens.has(token)
  ).length;
  const allCreatedSelected =
    newlyCreated.length > 0 &&
    newlyCreated.every((token) => selectedTokens.has(token));

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 print:hidden">
        <Button
          variant="ghost"
          size="sm"
          className="mb-2"
          onClick={() => navigate({ to: "/engenharia" })}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar para códigos QR
        </Button>
        <h1 className="text-2xl font-bold">Gerar códigos QR</h1>
        <p className="text-sm text-muted-foreground">
          Gere e imprima códigos QR para rastreamento de equipamentos de climatização
        </p>
      </div>

      <Card className="mb-6 print:hidden">
        <CardContent className="pt-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="batchName">Nome do lote</Label>
              <Input
                id="batchName"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                placeholder="Ex: Lorena 2 - etiquetas de climatização"
                className="h-12 text-base"
              />
            </div>
            <div className="flex-1 space-y-2">
              <Label htmlFor="prefix">Prefixo (opcional)</Label>
              <Input
                id="prefix"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                placeholder="Ex: AT"
                className="h-12 text-base"
              />
            </div>
            <div className="w-24 space-y-2">
              <Label htmlFor="quantity">Quantidade</Label>
              <Input
                id="quantity"
                inputMode="numeric"
                max={999}
                value={quantity}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  setQuantity(val);
                }}
                placeholder="5"
                className="h-12 text-base"
              />
            </div>
            <Button
              onClick={handleGenerate}
              disabled={generating || !isValidQuantity}
              className="h-12 text-base"
            >
              {generating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Gerar
            </Button>
          </div>
        </CardContent>
      </Card>

      {newlyCreated.length > 0 && (
        <div className="mb-6">
          <div className="mb-3 flex flex-col gap-3 print:hidden sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                Lote gerado agora
              </h2>
              <p className="text-sm text-muted-foreground">
                Veja os códigos, selecione individuais ou imprima o lote completo.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" />
                Imprimir lote
              </Button>
              <Button
                variant="outline"
                disabled={selectedCreatedCount === 0}
                onClick={handlePrintSelected}
              >
                <Printer className="mr-2 h-4 w-4" />
                Imprimir selecionados ({selectedCreatedCount})
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  navigate({
                    to: "/engenharia",
                    search: { filter: "latest_batch" },
                  })
                }
              >
                <ListChecks className="mr-2 h-4 w-4" />
                Ver no gerenciamento
              </Button>
            </div>
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <Card className="overflow-hidden print:hidden">
              <CardHeader className="border-b pb-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <CardTitle className="text-base">Códigos do lote</CardTitle>
                    <p className="mt-1 truncate text-sm font-medium">
                      {latestCreateBatchName ?? "Lote sem nome"}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                      {latestCreateBatch ?? "Lote sem identificador"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {newlyCreated.length} código
                      {newlyCreated.length === 1 ? "" : "s"}
                    </span>
                    <Button variant="outline" size="sm" onClick={toggleAllCreated}>
                      {allCreatedSelected ? "Desmarcar todos" : "Selecionar todos"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {newlyCreated.map((token) => (
                    <div
                      key={token}
                      className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <Checkbox
                          aria-label={`Selecionar código QR ${token}`}
                          checked={selectedTokens.has(token)}
                          onCheckedChange={() => toggleToken(token)}
                        />
                        <span className="truncate font-mono text-sm font-semibold">
                          {token}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pl-8 sm:justify-end sm:pl-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          title="Ver código QR"
                          onClick={() => setPreviewToken(token)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handlePrintOne(token)}
                        >
                          <Printer className="mr-2 h-4 w-4" />
                          Imprimir
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <QrPreviewCard
              token={previewToken}
              baseUrl={baseUrl}
              onClose={() => setPreviewToken(null)}
            />
          </div>
        </div>
      )}

      <div className="print:hidden">
        {newlyCreated.length > 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Esses códigos também aparecem no filtro "Últimos Gerados" da página
            de gerenciamento.
          </p>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Para visualizar, filtrar e imprimir códigos QR existentes, acesse a{" "}
            <button
              onClick={() => navigate({ to: "/engenharia" })}
              className="font-medium text-primary underline"
            >
              página de gerenciamento
            </button>
            .
          </p>
        )}
      </div>
    </div>
  );
}

function QrPreviewCard({
  token,
  baseUrl,
  onClose,
}: {
  token: string | null;
  baseUrl: string;
  onClose: () => void;
}) {
  if (!token) {
    return (
      <Card className="hidden print:hidden lg:sticky lg:top-6 lg:block">
        <CardContent className="flex min-h-64 flex-col items-center justify-center p-5 text-center">
          <Eye className="mb-2 h-5 w-5 text-muted-foreground" />
          <p className="text-sm font-medium">Pré-visualização do QR</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Escolha um código na lista para ver a imagem.
          </p>
        </CardContent>
      </Card>
    );
  }

  const url = `${baseUrl}/q/${token}`;

  return (
    <Card className="print:hidden lg:sticky lg:top-6">
      <CardContent className="flex flex-col items-center p-5 text-center">
        <div className="mb-4 flex w-full items-center justify-between gap-2 border-b pb-3">
          <div className="min-w-0 text-left">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Pré-visualização
            </p>
            <p className="truncate font-mono text-sm font-semibold">{token}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Fechar pré-visualização"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="rounded-xl border bg-white p-3">
          <QRCodeSVG value={url} size={170} level="M" />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Imagem exibida apenas para conferência.
        </p>
      </CardContent>
    </Card>
  );
}
