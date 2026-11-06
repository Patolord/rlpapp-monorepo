import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";

/**
 * Peças comuns das páginas de App Takeoff (Dutos, VRF, Gerais e presets): o cabeçalho, a barra
 * única de publicação e a conversão dos campos numéricos.
 */

/** Campos numéricos guardam texto enquanto se digita; "" = sem valor. */
export const toText = (n: number | null | undefined) =>
  n === null || n === undefined ? "" : String(n);
export const toNumber = (t: string): number | undefined => {
  const n = Number(t.replace(",", "."));
  return t.trim() !== "" && Number.isFinite(n) ? n : undefined;
};

export function TakeoffPageHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

/**
 * Barra fixa no rodapé enquanto há alterações não publicadas: uma publicação só por página, em
 * vez de um botão por cartão.
 */
export function PublishBar({
  dirty,
  busy,
  disabled,
  onPublish,
  onDiscard,
}: {
  dirty: boolean;
  busy: boolean;
  disabled?: boolean;
  onPublish: () => void;
  onDiscard: () => void;
}) {
  if (!dirty && !busy) return null;
  return (
    <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-control-border bg-card px-4 py-3 shadow-lg">
      <span className="size-2 rounded-full bg-status-warning" aria-hidden />
      <p className="flex-1 text-sm font-medium">Alterações não publicadas</p>
      <Button variant="ghost" onClick={onDiscard} disabled={busy}>
        Descartar
      </Button>
      <Button onClick={onPublish} disabled={busy || disabled}>
        {busy && <Loader2 className="size-4 animate-spin" />}
        Publicar alterações
      </Button>
    </div>
  );
}

/** Roda uma publicação com toast de sucesso ou erro; `busy` enquanto ela corre. */
export function usePublisher() {
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(done);
      return true;
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível publicar"));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}
