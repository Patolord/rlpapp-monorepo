import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { UserButton } from "@clerk/tanstack-react-start";
import { QrCode, Keyboard } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/qr-operador")({
  beforeLoad: async ({ context }) => {
    if (!(context as any).userId) {
      throw redirect({ to: "/" });
    }
  },
  component: QrOperadorPage,
});

function QrOperadorPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 shrink-0 items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <img
            src="/logo.jpg"
            alt="RLP Engenharia"
            className="size-9 rounded-full object-cover"
          />
          <h1 className="text-sm font-semibold">RLP Engenharia</h1>
        </div>
        <UserButton />
      </header>

      <div className="flex flex-1 items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center gap-4 pt-6 pb-6 text-center">
            <QrCode className="h-12 w-12 text-muted-foreground" />
            <div className="space-y-1">
              <h2 className="text-xl font-bold">Escaneie um QR Code</h2>
              <p className="text-sm text-muted-foreground">
                Use a câmera do seu celular para escanear o QR code de um
                equipamento e acessar as informações dele.
              </p>
            </div>
            <Button
              variant="outline"
              className="h-12 w-full text-base"
              render={<Link to="/registro" />}
            >
              <Keyboard className="mr-2 h-5 w-5" />
              Digitar código da etiqueta
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
