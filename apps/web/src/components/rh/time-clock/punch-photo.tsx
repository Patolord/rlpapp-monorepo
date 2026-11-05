import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { Camera } from "lucide-react";
import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type PunchId = Id<"clockPunches">;

/**
 * Foto da marcação, pedida só quando o diálogo abre. A imagem é baixada com
 * `fetch` sem cache e vive como blob em memória: um `<img>` apontando direto
 * para o storage cairia no cache de imagens do service worker.
 */
export function PunchPhoto({ punchId, personName }: { punchId: PunchId; personName: string }) {
  const url = useQuery(api.timeClock.getPunchPhotoUrl, { punchId });
  const [result, setResult] = useState<
    { source: string; objectUrl: string } | { source: string; error: true } | null
  >(null);

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    async function load(source: string) {
      try {
        const response = await fetch(source, { cache: "no-store", signal: controller.signal });
        const blob = await response.blob();
        if (!response.ok || !blob.type.startsWith("image/")) throw new Error("not an image");
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setResult({ source, objectUrl });
      } catch {
        if (!controller.signal.aborted) setResult({ source, error: true });
      }
    }
    void load(url);
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (url === null || (result !== null && result.source === url && "error" in result)) {
    return (
      <p role="alert" className="py-8 text-center text-sm text-muted-foreground">
        Foto indisponível.
      </p>
    );
  }
  if (url === undefined || !result || result.source !== url || !("objectUrl" in result)) {
    return (
      <p role="status" className="py-8 text-center text-sm text-muted-foreground">
        Carregando foto…
      </p>
    );
  }
  return (
    <img
      src={result.objectUrl}
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
