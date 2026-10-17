import { useAuth } from "@clerk/tanstack-react-start";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { env } from "@rlpapp/env/web";
import { Camera } from "lucide-react";
import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { convexSiteUrl } from "@/lib/project-documents";
import { cn } from "@/lib/utils";

type PunchId = Id<"timeClockPunches">;

export function timeClockPhotoUrl(convexUrl: string, punchId: PunchId): string {
  return new URL(`/time-clock/photo/${punchId}`, convexSiteUrl(convexUrl)).toString();
}

function errorMessage(status: number): string {
  if (status === 401) return "Sessão expirada. Entre novamente para ver a foto.";
  if (status === 403) return "Você não tem acesso a esta foto.";
  return "Foto indisponível no momento.";
}

/**
 * Busca a foto pelo proxy autenticado só quando montado; a imagem vive como
 * blob em memória e é descartada ao fechar (nada fica em cache).
 */
export function PunchPhoto({ punchId, personName }: { punchId: PunchId; personName: string }) {
  const { getToken } = useAuth();
  const [result, setResult] = useState<
    { punchId: PunchId; url: string } | { punchId: PunchId; error: string } | null
  >(null);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    async function load() {
      try {
        const token = await getToken({ template: "convex" });
        if (!token) throw new Error(errorMessage(401));
        const response = await fetch(timeClockPhotoUrl(env.VITE_CONVEX_URL, punchId), {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(errorMessage(response.status));
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) throw new Error(errorMessage(404));
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setResult({ punchId, url: objectUrl });
      } catch (error) {
        if (controller.signal.aborted) return;
        setResult({
          punchId,
          error: error instanceof Error ? error.message : errorMessage(404),
        });
      }
    }
    void load();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [getToken, punchId]);

  if (result?.punchId !== punchId) {
    return (
      <p role="status" className="py-8 text-center text-sm text-muted-foreground">
        Carregando foto…
      </p>
    );
  }
  if ("error" in result) {
    return (
      <p role="alert" className="py-8 text-center text-sm text-muted-foreground">
        {result.error}
      </p>
    );
  }
  return (
    <img
      src={result.url}
      alt={`Foto da marcação de ${personName}`}
      className="max-h-[70vh] w-full rounded-md object-contain"
    />
  );
}

/** Botão "foto" que abre a foto da marcação num diálogo, sob demanda. */
export function PunchPhotoButton({
  punchId,
  personName,
  className,
}: {
  punchId: PunchId;
  personName: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={cn(
          "inline-flex items-center gap-1 text-xs text-primary hover:underline",
          className
        )}
        aria-label={`Ver foto da marcação de ${personName}`}
      >
        <Camera className="size-3.5" /> foto
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Foto da marcação · {personName}</DialogTitle>
        </DialogHeader>
        {open ? <PunchPhoto punchId={punchId} personName={personName} /> : null}
      </DialogContent>
    </Dialog>
  );
}
