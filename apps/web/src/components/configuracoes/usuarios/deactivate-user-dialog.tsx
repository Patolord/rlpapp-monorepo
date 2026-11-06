import { api } from "@rlpapp/backend/convex/_generated/api";
import { formatDisplayName } from "@rlpapp/shared";
import { useMutation } from "convex/react";
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

export function DeactivateUserDialog({
  user,
  onClose,
}: {
  user: User | null;
  onClose: () => void;
}) {
  const removeUser = useMutation(api.users.remove);
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    if (!user) return;
    setSaving(true);
    const ok = await runWithToast(
      () => removeUser({ id: user._id }),
      "Usuário desativado",
      "Erro ao desativar usuário"
    );
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Desativar usuário?</DialogTitle>
          <DialogDescription>
            {user ? formatDisplayName(user.name) : "O usuário"} perde o acesso
            ao sistema e ao app na hora. O cadastro continua na lista e pode ser
            reativado depois.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={saving}
            onClick={handleConfirm}
          >
            {saving && <Loader2 className="animate-spin" />}
            Desativar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
