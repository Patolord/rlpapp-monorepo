import { Loader2, Printer, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Barra de ações em massa sobre as etiquetas selecionadas. */
export function QrSelectionBar({
  count,
  bulkDeleting,
  onClear,
  onPrint,
  onBulkDelete,
}: {
  count: number;
  bulkDeleting: boolean;
  onClear: () => void;
  onPrint: () => void;
  onBulkDelete: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/50 p-3 sm:flex-row sm:items-center">
      <span className="text-sm font-medium">
        {count} selecionada
        {count === 1 ? "" : "s"}
      </span>
      <div className="flex-1" />
      <Button variant="ghost" size="sm" onClick={onClear}>
        <X />
        Limpar
      </Button>
      <Button variant="outline" size="sm" onClick={onPrint}>
        <Printer />
        Imprimir selecionadas
      </Button>
      <Button
        variant="destructive"
        size="sm"
        disabled={bulkDeleting}
        onClick={onBulkDelete}
      >
        {bulkDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
        Excluir livres
      </Button>
    </div>
  );
}
