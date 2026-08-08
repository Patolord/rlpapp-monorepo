import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Camera, Loader2, QrCode, RotateCcw, X } from "lucide-react";
import type { Html5Qrcode } from "html5-qrcode";

import { Button } from "@/components/ui/button";

export function extractQrToken(decodedText: string): string | null {
  const raw = decodedText.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const match = url.pathname.match(/\/q\/([^/]+)/);
    if (match?.[1]) return decodeURIComponent(match[1]).toUpperCase();
  } catch {
    // Não é uma URL completa; tenta caminho relativo ou token puro.
  }

  const pathMatch = raw.match(/\/q\/([^/?#]+)/);
  if (pathMatch?.[1]) {
    return decodeURIComponent(pathMatch[1]).toUpperCase();
  }

  return raw.toUpperCase().replace(/\s+/g, "");
}

type ScannerState = "idle" | "starting" | "scanning" | "error";

export function FieldQrScanner() {
  const navigate = useNavigate();
  const reactId = useId();
  const elementId = `field-qr-reader-${reactId.replace(/:/g, "")}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const mountedRef = useRef(true);
  const [state, setState] = useState<ScannerState>("idle");
  const [error, setError] = useState<string | null>(null);

  const stopScanner = useCallback(async (nextState: ScannerState = "idle") => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      try {
        if (scanner.isScanning) await scanner.stop();
      } catch {
        // A câmera pode já ter sido interrompida pelo navegador.
      }
      try {
        scanner.clear();
      } catch {
        // O elemento pode ter sido desmontado durante a navegação.
      }
    }
    if (mountedRef.current) setState(nextState);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void stopScanner();
    };
  }, [stopScanner]);

  const startScanner = useCallback(async () => {
    setError(null);
    setState("starting");

    // Aguarda o contêiner da câmera entrar no DOM.
    await new Promise((resolve) => window.setTimeout(resolve, 50));

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode(elementId);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText: string) => {
          const token = extractQrToken(decodedText);
          if (!token) {
            setError("O conteúdo lido não é um código QR válido.");
            return;
          }
          void stopScanner().then(() =>
            navigate({ to: "/q/$token", params: { token } })
          );
        },
        () => {
          // Leituras sem QR são esperadas enquanto a câmera está aberta.
        }
      );
      if (mountedRef.current) setState("scanning");
    } catch {
      scannerRef.current = null;
      if (mountedRef.current) {
        setError(
          "Não foi possível acessar a câmera. Verifique a permissão do navegador."
        );
        setState("error");
      }
    }
  }, [elementId, navigate, stopScanner]);

  if (state === "idle" || state === "error") {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <div className="rounded-full bg-primary/10 p-4">
          <QrCode className="size-10 text-primary" />
        </div>
        <div className="max-w-md space-y-1">
          <h3 className="text-lg font-semibold">Escanear etiqueta</h3>
          <p className="text-sm text-muted-foreground">
            Use a câmera traseira e mantenha o código inteiro dentro do quadro.
          </p>
        </div>
        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button className="h-12 w-full max-w-sm text-base" onClick={() => void startScanner()}>
          {state === "error" ? (
            <RotateCcw className="mr-2 size-5" />
          ) : (
            <Camera className="mr-2 size-5" />
          )}
          {state === "error" ? "Tentar novamente" : "Abrir câmera"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative min-h-64 overflow-hidden rounded-xl bg-black">
        <div id={elementId} className="w-full" />
        {state === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <Loader2 className="mr-2 size-5 animate-spin" />
            Abrindo câmera...
          </div>
        )}
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Aponte a câmera para o QR do equipamento. A abertura é automática.
      </p>
      <Button
        variant="outline"
        className="h-12 w-full text-base"
        onClick={() => void stopScanner()}
      >
        <X className="mr-2 size-5" />
        Cancelar leitura
      </Button>
    </div>
  );
}
