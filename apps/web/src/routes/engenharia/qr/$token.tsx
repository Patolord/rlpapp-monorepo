import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { QRCodeSVG } from "qrcode.react";
import { StatusBadge } from "@/components/engenharia/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tag,
  Loader2,
  AlertTriangle,
  QrCode,
  ArrowLeft,
} from "lucide-react";
import { AuthShell } from "@/components/auth-shell";

export const Route = createFileRoute("/engenharia/qr/$token")({
  component: QrDetailPage,
});

function QrDetailPage() {
  return (
    <AuthShell>
      <QrDetailContent />
    </AuthShell>
  );
}

function QrDetailContent() {
  const { token } = Route.useParams();
  const data = useQuery(api.qrCodes.getByToken, { token });

  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://app.rlp.com";

  if (data === undefined) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertTriangle className="h-12 w-12 text-yellow-500" />
          <h1 className="text-2xl font-bold">Código QR não encontrado</h1>
          <p className="text-muted-foreground">
            O código QR ({token}) não está registrado no sistema.
          </p>
          <Button variant="outline" render={<Link to="/engenharia" />}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>
      </div>
    );
  }

  const { qrCode, equipment } = data;

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4">
        <Button variant="ghost" size="sm" render={<Link to="/engenharia" />}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar para códigos QR
        </Button>
      </div>

      {/* QR Code Visual */}
      <Card className="mb-4">
        <CardContent className="flex flex-col items-center pt-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            RLP Engenharia
          </p>
          <p className="mb-3 font-mono text-lg font-bold">{qrCode.token}</p>
          <QRCodeSVG
            value={`${baseUrl}/q/${qrCode.token}`}
            size={180}
            level="M"
          />
          <div className="mt-3 flex items-center gap-2">
            {qrCode.equipmentId ? (
              <Badge
                variant="outline"
                className="bg-blue-50 text-blue-700 border-blue-200"
              >
                Vinculado
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="bg-gray-50 text-gray-500 border-gray-200"
              >
                Livre
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              Criado em{" "}
              {new Date(qrCode.createdAt).toLocaleDateString("pt-BR")}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Equipment Details */}
      {equipment ? (
        <Card className="mb-4">
          <CardContent className="pt-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-xl font-bold">
                    {equipment.description ?? "Equipamento"}
                  </h2>
                </div>
              </div>
              <StatusBadge status={equipment.status} />
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="mb-4">
          <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
            <QrCode className="h-10 w-10 text-muted-foreground" />
            <div>
              <h2 className="text-lg font-semibold">
                Nenhum Equipamento Vinculado
              </h2>
              <p className="text-sm text-muted-foreground">
                Este código QR ainda não foi vinculado a nenhum equipamento. O
                vínculo ocorre quando alguém escaneia o código e preenche o
                formulário de registro.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
