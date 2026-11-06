import type { ReactNode } from "react";

import { DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/* Dialog chrome (cabeçalho fixo, corpo rolável, rodapé fixo) */

export const DIALOG_CLASS =
  "flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg";

export function DialogBody({ children }: { children: ReactNode }) {
  return <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">{children}</div>;
}

export function DialogActions({
  start,
  children,
}: {
  /** Ação secundária alinhada à esquerda (ex.: reenviar convite). */
  start?: ReactNode;
  children: ReactNode;
}) {
  return (
    <DialogFooter
      className={cn(
        "border-t border-border bg-muted/30 px-6 py-4 sm:items-center",
        start ? "sm:justify-between" : "sm:justify-end"
      )}
    >
      {start}
      <div className="flex flex-col-reverse gap-2 sm:flex-row">{children}</div>
    </DialogFooter>
  );
}
