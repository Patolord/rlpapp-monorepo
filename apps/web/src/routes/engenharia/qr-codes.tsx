import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Printer, Plus, ArrowLeft } from "lucide-react";
import { ConvexUnauthRedirect } from "@/components/convex-unauth-redirect";
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
    <>
      <Authenticated>
        <QrCodesContent />
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

function QrCodesContent() {
  const batchCreate = useMutation(api.qrCodes.batchCreate);
  const navigate = useNavigate();

  const [prefix, setPrefix] = useState("");
  const [quantity, setQuantity] = useState("");
  const [generating, setGenerating] = useState(false);
  const [newlyCreated, setNewlyCreated] = useState<string[]>([]);

  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://app.rlp.com";

  const parsedQuantity = parseInt(quantity, 10);
  const isValidQuantity = !isNaN(parsedQuantity) && parsedQuantity > 0 && parsedQuantity <= 50;

  async function handleGenerate() {
    if (!isValidQuantity) return;
    setGenerating(true);
    try {
      const tokens: string[] = [];
      for (let i = 0; i < parsedQuantity; i++) {
        const token = prefix ? `${prefix}-${generateToken(6)}` : generateToken(8);
        tokens.push(token);
      }
      await batchCreate({ tokens });
      setNewlyCreated(tokens);
    } catch (err) {
      console.error("Failed to generate QR codes:", err);
    } finally {
      setGenerating(false);
    }
  }

  function handlePrint() {
    printQrCodes({ tokens: newlyCreated, baseUrl });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 print:hidden">
        <Button
          variant="ghost"
          size="sm"
          className="mb-2"
          onClick={() => navigate({ to: "/engenharia" })}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar para QR Codes
        </Button>
        <h1 className="text-2xl font-bold">Gerar QR Codes</h1>
        <p className="text-sm text-muted-foreground">
          Gere e imprima QR codes para rastreamento de equipamentos HVAC
        </p>
      </div>

      <Card className="mb-6 print:hidden">
        <CardContent className="pt-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
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
              <Label htmlFor="quantity">Qtd</Label>
              <Input
                id="quantity"
                inputMode="numeric"
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
          <div className="mb-3 flex items-center justify-between print:hidden">
            <h2 className="text-lg font-semibold">
              Gerados ({newlyCreated.length})
            </h2>
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              Imprimir
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 print:grid-cols-4 print:gap-4">
            {newlyCreated.map((token) => (
              <QrLabel key={token} token={token} baseUrl={baseUrl} />
            ))}
          </div>
        </div>
      )}

      <div className="print:hidden">
        {newlyCreated.length > 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Você também pode visualizar esses QR Codes na{" "}
            <button
              onClick={() => navigate({ to: "/engenharia", search: { filter: "latest_batch" } })}
              className="font-medium text-primary underline"
            >
              página de gerenciamento
            </button>{" "}
            usando o filtro "Últimos Gerados".
          </p>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Para visualizar, filtrar e imprimir QR Codes existentes, acesse a{" "}
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

function QrLabel({ token, baseUrl }: { token: string; baseUrl: string }) {
  const url = `${baseUrl}/q/${token}`;

  return (
    <div className="flex flex-col items-center rounded-lg border bg-white p-4 text-center print:break-inside-avoid print:border-2 print:border-gray-300">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
        RLP Engenharia
      </p>
      <p className="mb-2 font-mono text-sm font-bold text-black">{token}</p>
      <QRCodeSVG value={url} size={120} level="M" />
    </div>
  );
}
