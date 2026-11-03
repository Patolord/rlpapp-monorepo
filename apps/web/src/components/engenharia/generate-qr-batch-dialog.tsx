import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { CheckCircle2, Loader2, Plus, Printer } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/errors";
import { printQrCodes } from "@/lib/qr-print";

// Alfabeto sem caracteres ambíguos (0/O, 1/I/L) para leitura em etiqueta.
const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_QUANTITY = 999;

function randomToken(length: number): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += TOKEN_ALPHABET.charAt(
      Math.floor(Math.random() * TOKEN_ALPHABET.length)
    );
  }
  return result;
}

function buildTokens(quantity: number, prefix: string): string[] {
  const tokens = new Set<string>();
  while (tokens.size < quantity) {
    tokens.add(prefix ? `${prefix}-${randomToken(6)}` : randomToken(8));
  }
  return Array.from(tokens);
}

type CreatedBatch = {
  batchId: string;
  batchName: string | null;
  tokens: string[];
};

/**
 * Gera um lote de etiquetas QR livres para a obra (impressas e depois
 * cadastradas em campo pelo técnico). O lote nasce vinculado à obra.
 */
export function GenerateQrBatchDialog({
  projectId,
  projectName,
  trigger,
  onCreated,
}: {
  projectId: Id<"projects">;
  projectName: string;
  trigger: ReactNode;
  onCreated?: (tokens: string[]) => void;
}) {
  const batchCreate = useMutation(api.qrCodes.batchCreate);
  const [open, setOpen] = useState(false);
  const [batchName, setBatchName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [quantity, setQuantity] = useState("");
  const [generating, setGenerating] = useState(false);
  const [created, setCreated] = useState<CreatedBatch | null>(null);

  const parsedQuantity = parseInt(quantity, 10);
  const isValidQuantity =
    !Number.isNaN(parsedQuantity) &&
    parsedQuantity > 0 &&
    parsedQuantity <= MAX_QUANTITY;

  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://app.rlp.com";

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setBatchName("");
      setPrefix("");
      setQuantity("");
      setCreated(null);
    }
  }

  async function handleGenerate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidQuantity || generating) return;
    setGenerating(true);
    try {
      const result = await batchCreate({
        tokens: buildTokens(parsedQuantity, prefix.trim()),
        batchName: batchName.trim() || undefined,
        projectId,
      });
      const tokens = result.created.map((qr) => qr.token);
      if (tokens.length === 0) {
        toast.error("Nenhuma etiqueta nova foi criada");
        return;
      }
      setCreated({
        batchId: result.batchId,
        batchName: result.batchName ?? null,
        tokens,
      });
      onCreated?.(tokens);
      toast.success(
        `${tokens.length} etiqueta${tokens.length === 1 ? "" : "s"} gerada${
          tokens.length === 1 ? "" : "s"
        }`
      );
    } catch (err) {
      toast.error(getErrorMessage(err, "Erro ao gerar etiquetas"));
    } finally {
      setGenerating(false);
    }
  }

  function handlePrint() {
    if (!created) return;
    printQrCodes({
      tokens: created.tokens,
      baseUrl,
      title: `Códigos QR ${created.batchName ?? created.batchId} - ${projectName} - RLP Engenharia`,
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-emerald-600" />
                Lote gerado
              </DialogTitle>
              <DialogDescription>
                {created.tokens.length} etiqueta
                {created.tokens.length === 1 ? "" : "s"} do lote{" "}
                <span className="font-medium text-foreground">
                  {created.batchName ?? created.batchId}
                </span>{" "}
                já pertence{created.tokens.length === 1 ? "" : "m"} a{" "}
                {projectName}. Imprima agora ou depois, pela lista da obra.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-48 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-6">
              {created.tokens.join("  ")}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Concluir
              </Button>
              <Button type="button" onClick={handlePrint}>
                <Printer />
                Imprimir etiquetas
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleGenerate} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Gerar etiquetas QR</DialogTitle>
              <DialogDescription>
                Etiquetas livres para colar nos equipamentos de {projectName}.
                O técnico cadastra o equipamento ao escanear a etiqueta.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_120px_96px]">
              <div className="space-y-2">
                <Label htmlFor="qr-batch-name">Nome do lote</Label>
                <Input
                  id="qr-batch-name"
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  placeholder="Ex: Torre A - climatização"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="qr-batch-prefix">Prefixo</Label>
                <Input
                  id="qr-batch-prefix"
                  value={prefix}
                  onChange={(e) =>
                    setPrefix(
                      e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, "")
                        .slice(0, 6)
                    )
                  }
                  placeholder="Opcional"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="qr-batch-quantity">Quantidade</Label>
                <Input
                  id="qr-batch-quantity"
                  inputMode="numeric"
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(e.target.value.replace(/\D/g, "").slice(0, 3))
                  }
                  placeholder="10"
                  autoFocus
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Até {MAX_QUANTITY} etiquetas por lote. O prefixo ajuda a
              identificar o lote na etiqueta impressa (ex.: AT-7K2M9X).
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={!isValidQuantity || generating}>
                {generating ? <Loader2 className="animate-spin" /> : <Plus />}
                Gerar
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
