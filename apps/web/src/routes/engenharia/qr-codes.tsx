import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Printer, Plus } from "lucide-react";
import { ConvexUnauthRedirect } from "@/components/convex-unauth-redirect";

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
  const qrCodes = useQuery(api.qrCodes.list);
  const batchCreate = useMutation(api.qrCodes.batchCreate);

  const [prefix, setPrefix] = useState("AT");
  const [quantity, setQuantity] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [newlyCreated, setNewlyCreated] = useState<string[]>([]);

  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://app.rlp.com";

  async function handleGenerate() {
    setGenerating(true);
    try {
      const tokens: string[] = [];
      for (let i = 0; i < quantity; i++) {
        tokens.push(`${prefix}-${generateToken(6)}`);
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
    window.print();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 print:hidden">
        <h1 className="text-2xl font-bold">Gerar QR Codes</h1>
        <p className="text-sm text-muted-foreground">
          Gere e imprima QR codes para rastreamento de equipamentos HVAC
        </p>
      </div>

      <Card className="mb-6 print:hidden">
        <CardContent className="pt-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="prefix">Prefixo</Label>
              <Input
                id="prefix"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                placeholder="AT"
                className="h-12 text-base"
              />
            </div>
            <div className="w-24 space-y-2">
              <Label htmlFor="quantity">Qtd</Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                max={50}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="h-12 text-base"
              />
            </div>
            <Button
              onClick={handleGenerate}
              disabled={generating || !prefix}
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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 print:grid-cols-3 print:gap-6">
            {newlyCreated.map((token) => (
              <QrLabel key={token} token={token} baseUrl={baseUrl} />
            ))}
          </div>
        </div>
      )}

      <div className="print:hidden">
        <h2 className="mb-3 text-lg font-semibold">QR Codes Existentes</h2>
        {qrCodes === undefined ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : qrCodes.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum QR code gerado ainda.
          </p>
        ) : (
          <div className="space-y-2">
            {qrCodes.map((qr) => (
              <Card key={qr._id}>
                <CardContent className="flex items-center justify-between py-3">
                  <div>
                    <span className="font-mono text-sm font-medium">
                      {qr.token}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {new Date(qr.createdAt).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {qr.equipmentId ? (
                      <Badge
                        variant="outline"
                        className="bg-blue-50 text-blue-700 border-blue-200"
                      >
                        Vinculado ao equipamento.
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-gray-50 text-gray-500 border-gray-200"
                      >
                        Livre
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
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
