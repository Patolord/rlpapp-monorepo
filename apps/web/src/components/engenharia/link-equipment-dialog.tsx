import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { Loader2, PackageOpen } from "lucide-react";

import { StatusBadge } from "@/components/engenharia/status-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { runWithToast } from "@/lib/errors";

export function LinkEquipmentDialog({
  itemId,
  onClose,
}: {
  itemId: Id<"projectEquipment"> | null;
  onClose: () => void;
}) {
  const assignable = useQuery(
    api.equipment.listAssignable,
    itemId ? {} : "skip"
  );
  const link = useMutation(api.projectEquipment.linkEquipment);
  const [saving, setSaving] = useState<string | null>(null);

  async function handleLink(equipmentId: string) {
    if (!itemId) return;
    setSaving(equipmentId);
    const ok = await runWithToast(
      () =>
        link({
          itemId,
          equipmentId: equipmentId as Id<"equipment">,
        }),
      "Equipamento vinculado",
      "Não foi possível vincular"
    );
    setSaving(null);
    if (ok) onClose();
  }

  return (
    <Dialog open={itemId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vincular equipamento</DialogTitle>
          <DialogDescription>
            Escolha um equipamento cadastrado em campo (via QR) para marcar este
            item como instalado.
          </DialogDescription>
        </DialogHeader>

        {assignable === undefined ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : assignable.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <PackageOpen className="size-10 text-muted-foreground" />
            <p className="max-w-xs text-sm text-muted-foreground">
              Nenhum equipamento disponível. Eles aparecem aqui depois de
              cadastrados em campo via leitura do QR code.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {assignable.map((item) => (
              <button
                key={item._id}
                type="button"
                disabled={saving !== null}
                onClick={() => handleLink(item._id)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {item.description ?? "Equipamento"}
                  </p>
                  {item.token && (
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {item.token}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={item.status} />
                  {saving === item._id && (
                    <Loader2 className="size-4 animate-spin" />
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
