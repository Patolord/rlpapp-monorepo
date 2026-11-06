import { api } from "@rlpapp/backend/convex/_generated/api";
import { useAction } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import type { User } from "@/components/configuracoes/usuarios/admin-user";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { runWithToast } from "@/lib/errors";

export function RevokeInviteDialog({
  user,
  onClose,
}: {
  user: User | null;
  onClose: () => void;
}) {
  const revokeInvite = useAction(api.userAdmin.adminRevokeInvite);
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    if (!user) return;
    setSaving(true);
    const ok = await runWithToast(
      () => revokeInvite({ id: user._id }),
      "Convite cancelado",
      "Erro ao cancelar convite"
    );
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Cancelar convite?</DialogTitle>
          <DialogDescription>
            O link enviado para {user?.email ?? "a pessoa"} deixa de valer e o
            cadastro sai da lista. Você pode convidar de novo quando quiser.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Manter convite
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={saving}
            onClick={handleConfirm}
          >
            {saving && <Loader2 className="animate-spin" />}
            Cancelar convite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
