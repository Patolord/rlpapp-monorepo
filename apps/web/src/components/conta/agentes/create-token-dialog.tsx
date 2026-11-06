import { api } from "@rlpapp/backend/convex/_generated/api";
import { useAction } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { Permission } from "@/components/conta/agentes/agent-tokens";
import { CopyButton } from "@/components/conta/agentes/code-block";
import { ConnectionSnippets } from "@/components/conta/agentes/connection-snippets";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getErrorMessage } from "@/lib/errors";

const EXPIRY_OPTIONS = [
  { value: "never", label: "Sem validade" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "365", label: "1 ano" },
] as const;
type ExpiryOption = (typeof EXPIRY_OPTIONS)[number]["value"];

export function CreateTokenDialog({
  isOpen,
  onClose,
  mcpUrl,
}: {
  isOpen: boolean;
  onClose: () => void;
  mcpUrl: string;
}) {
  const createToken = useAction(api.agentTokens.create);
  const [name, setName] = useState("");
  const [permission, setPermission] = useState<Permission>("read_only");
  const [expiry, setExpiry] = useState<ExpiryOption>("never");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [created, setCreated] = useState<{ token: string; name: string } | null>(
    null
  );

  const reset = () => {
    setName("");
    setPermission("read_only");
    setExpiry("never");
    setCreated(null);
    setIsSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const result = await createToken({
        name,
        permission,
        expiresInDays: expiry === "never" ? undefined : Number(expiry),
      });
      setCreated({ token: result.token, name: result.name });
      toast.success("Token criado");
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao criar token"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Guarde o seu token</DialogTitle>
              <DialogDescription>
                Esta é a única vez que{" "}
                <span className="font-medium">{created.name}</span> será
                mostrado. Guarde-o em local seguro; se perder, revogue e crie
                outro.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2 font-mono text-xs">
                  {created.token}
                </code>
                <CopyButton value={created.token} label="Token" />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Conectar o agente
                </p>
                <ConnectionSnippets mcpUrl={mcpUrl} token={created.token} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Concluir</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Novo token de agente</DialogTitle>
              <DialogDescription>
                O token herda o seu cargo e departamento. Somente leitura
                consulta tudo o que você vê; acesso total também grava.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="token-name">Nome</Label>
                <Input
                  id="token-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Claude no meu notebook"
                  maxLength={80}
                  required
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Permissão</Label>
                  <Select
                    value={permission}
                    onValueChange={(v) => setPermission(v as Permission)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="read_only">Somente leitura</SelectItem>
                      <SelectItem value="full_access">Acesso total</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Validade</Label>
                  <Select
                    value={expiry}
                    onValueChange={(v) => setExpiry(v as ExpiryOption)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPIRY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting || !name.trim()}>
                {isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
                Criar token
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
