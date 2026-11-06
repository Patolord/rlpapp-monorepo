import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getErrorMessage } from "@/lib/errors";

export function RevokeTokenDialog({
  target,
  onClose,
}: {
  target: { _id: Id<"agentTokens">; name: string } | null;
  onClose: () => void;
}) {
  const revokeToken = useMutation(api.agentTokens.revoke);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRevoke = async () => {
    if (!target) return;
    setIsSubmitting(true);
    try {
      await revokeToken({ id: target._id });
      toast.success(`Token "${target.name}" revogado`);
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao revogar token"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Revogar &ldquo;{target?.name}&rdquo;?</DialogTitle>
          <DialogDescription>
            Toda conexão que usa este token passa a ser recusada imediatamente.
            Não dá para desfazer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleRevoke()}
            disabled={isSubmitting}
          >
            {isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
            Revogar token
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
