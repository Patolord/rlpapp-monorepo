import { Loader2, Monitor } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";

/**
 * Peças comuns das páginas de App Takeoff (Dutos, VRF, Gerais e presets): o aviso de que tudo
 * reflete no app desktop, a barra única de publicação e a conversão dos campos numéricos.
 */

export type SettingMeta = { updatedAt: number; updatedBy: string | null } | null;

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** "Publicado em 05/11/26 14:00 por Ana." ou o texto de ainda não publicado. */
export function publishedLine(meta: SettingMeta, unpublished: string): string {
  if (!meta) return unpublished;
  return `Publicado em ${dateFormat.format(meta.updatedAt)}${meta.updatedBy ? ` por ${meta.updatedBy}` : ""}.`;
}

/** Campos numéricos guardam texto enquanto se digita; "" = sem valor. */
export const toText = (n: number | null | undefined) =>
  n === null || n === undefined ? "" : String(n);
export const toNumber = (t: string): number | undefined => {
  const n = Number(t.replace(",", "."));
  return t.trim() !== "" && Number.isFinite(n) ? n : undefined;
};

export function TakeoffPageHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex gap-3 rounded-lg border border-status-info/30 bg-card px-4 py-3 text-sm">
        <Monitor className="mt-0.5 size-4 shrink-0 text-status-info" />
        <p>
          <span className="font-medium">Vale para o RLP Takeoff de todos os usuários</span> na
          próxima atualização do catálogo. O que um usuário alterou no próprio computador continua
          valendo para ele, e um campo vazio deixa valer o padrão embutido no app.
        </p>
      </div>
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
