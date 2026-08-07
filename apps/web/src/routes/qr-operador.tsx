import { useCallback, useEffect, useRef, useState } from "react";
import {
  createFileRoute,
  redirect,
  useNavigate,
  Link,
} from "@tanstack/react-router";
import { UserButton } from "@clerk/tanstack-react-start";
import { useQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { QrCode, Keyboard, ArrowLeft, Camera, X, History } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MyAssignedObras } from "@/components/engenharia/my-assigned-obras";
import {
  listPendingRecords,
  QUEUE_CHANGED_EVENT,
} from "@/lib/offline-queue";

import type { Html5Qrcode } from "html5-qrcode";

export const Route = createFileRoute("/qr-operador")({
  beforeLoad: async ({ context }) => {
    if (!context.userId) {
      throw redirect({ to: "/" });
    }
  },
  component: QrOperadorPage,
});

const SCANNER_ELEMENT_ID = "qr-operador-reader";

function extractToken(decodedText: string): string | null {
  const raw = decodedText.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const match = url.pathname.match(/\/q\/([^/]+)/);
    if (match?.[1]) {
      return decodeURIComponent(match[1]).toUpperCase();
    }
  } catch {
    // Não é uma URL completa, segue para os fallbacks abaixo
  }

  const pathMatch = raw.match(/\/q\/([^/?#]+)/);
  if (pathMatch?.[1]) {
    return decodeURIComponent(pathMatch[1]).toUpperCase();
  }

  // Código puro (ex: LORENAH4FC29)
  return raw.toUpperCase().replace(/\s+/g, "");
}

function usePendingCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void listPendingRecords().then((items) => {
        if (alive) setCount(items.length);
      });
    };
    refresh();
    window.addEventListener(QUEUE_CHANGED_EVENT, refresh);
    return () => {
      alive = false;
      window.removeEventListener(QUEUE_CHANGED_EVENT, refresh);
    };
  }, []);

  return count;
}

function QrOperadorPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const navigate = useNavigate();
  const pendingCount = usePendingCount();

  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch {
        // Ignora erros ao parar (câmera já parada)
      }
      try {
        scannerRef.current.clear();
      } catch {
        // Ignora erros ao limpar
      }
      scannerRef.current = null;
    }
    setScanning(false);
  }, []);

  const startScanner = useCallback(async () => {
    setScanning(true);

    await new Promise((r) => setTimeout(r, 100));

    const { Html5Qrcode } = await import("html5-qrcode");
    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
    scannerRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText: string) => {
          const token = extractToken(decodedText);
          if (!token) {
            toast.error("Código QR inválido");
            return;
          }
          void stopScanner();
          void navigate({ to: "/q/$token", params: { token } });
        },
        () => {}
      );
    } catch {
      toast.error("Não foi possível acessar a câmera");
      scannerRef.current = null;
      setScanning(false);
    }
  }, [navigate, stopScanner]);

  const backTo =
    currentUser?.role === "director"
      ? "/app"
      : currentUser?.role !== "qr_operator" && currentUser?.department
        ? `/${currentUser.department}`
        : null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 shrink-0 items-center justify-between px-6">
        <div className="flex items-center gap-3">
          {backTo ? (
            <Button
              variant="ghost"
              size="icon"
              className="-ml-2"
              render={<Link to={backTo} />}
              aria-label="Voltar"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          ) : (
            <>
              <img
                src="/logo.jpg"
                alt="RLP Engenharia"
                className="size-9 rounded-full object-cover"
              />
              <h1 className="text-sm font-semibold">RLP Engenharia</h1>
            </>
          )}
        </div>
        <UserButton />
      </header>

      <div className="flex flex-1 justify-center px-4 pb-8">
        <div className="flex w-full max-w-lg flex-col gap-4 py-4">
          <Card className="w-full">
            <CardContent className="flex flex-col items-center gap-4 pt-6 pb-6 text-center">
              {scanning ? (
                <>
                  <div
                    id={SCANNER_ELEMENT_ID}
                    className="w-full overflow-hidden rounded-lg bg-black"
                  />
                  <p className="text-sm text-muted-foreground">
                    Aponte a câmera para o código QR do equipamento.
                  </p>
                  <Button
                    variant="outline"
                    className="h-12 w-full text-base"
                    onClick={() => void stopScanner()}
                  >
                    <X className="mr-2 h-5 w-5" />
                    Cancelar
                  </Button>
                </>
              ) : (
                <>
                  <QrCode className="h-14 w-14 text-foreground" />
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-foreground">
                      Escaneie um código QR
                    </h2>
                    <p className="text-base font-medium text-foreground/80">
                      Use a câmera do seu celular para escanear o código QR de
                      um equipamento e acessar as informações dele.
                    </p>
                  </div>
                  <Button
                    className="h-12 w-full text-base"
                    onClick={() => void startScanner()}
                  >
                    <Camera className="mr-2 h-5 w-5" />
                    Escanear com a câmera
                  </Button>
                  <Button
                    variant="outline"
                    className="h-12 w-full text-base"
                    render={<Link to="/meus-registros" />}
                  >
                    <Keyboard className="mr-2 h-5 w-5" />
                    Digitar código da etiqueta
                  </Button>
                  <Button
                    variant="outline"
                    className="h-12 w-full text-base"
                    render={<Link to="/meus-registros" />}
                  >
                    <History className="mr-2 h-5 w-5" />
                    Meus registros
                    {pendingCount > 0 && (
                      <Badge variant="secondary" className="ml-2">
                        {pendingCount}
                      </Badge>
                    )}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {!scanning && <MyAssignedObras />}
        </div>
      </div>
    </div>
  );
}
