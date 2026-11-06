import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { TokenRow } from "@/components/conta/agentes/agent-tokens";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/errors";

export function RenameTokenDialog({
  target,
  onClose,
}: {
  target: TokenRow | null;
  onClose: () => void;
}) {
  const renameToken = useMutation(api.agentTokens.rename);
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [seededFor, setSeededFor] = useState<Id<"agentTokens"> | null>(null);
  if (!target && seededFor !== null) {
    // Fechou (ou cancelou): a próxima abertura volta a usar o nome atual.
    setSeededFor(null);
  } else if (target && seededFor !== target._id) {
    setSeededFor(target._id);
    setName(target.name);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    setIsSubmitting(true);
    try {
      await renameToken({ id: target._id, name });
      toast.success("Token renomeado");
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao renomear token"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Renomear token</DialogTitle>
            <DialogDescription>
              Só o nome muda. O token em si continua o mesmo.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            <Label htmlFor="token-rename">Nome</Label>
            <Input
              id="token-rename"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || !name.trim()}>
              {isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
