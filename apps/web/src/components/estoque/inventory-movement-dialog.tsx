import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex/react";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/errors";

type Access = FunctionReturnType<typeof api.inventory.getAccess>;
type Material = FunctionReturnType<
  typeof api.inventory.listMaterialOptions
>[number];
type Project = FunctionReturnType<typeof api.inventory.listProjects>[number];

type MovementType =
  | "entry"
  | "transfer"
  | "consumption"
  | "return"
  | "adjustment";

type FormLine = {
  id: number;
  materialId: string;
  quantity: string;
};

const MOVEMENT_LABELS: Record<MovementType, string> = {
  entry: "Entrada no central",
  transfer: "Envio para obra",
  consumption: "Consumo na obra",
  return: "Retorno ao central",
  adjustment: "Ajuste de saldo",
};

let nextLineId = 0;
const emptyLine = (): FormLine => {
  nextLineId += 1;
  return { id: nextLineId, materialId: "", quantity: "" };
};

function allowedTypes(access: Access): MovementType[] {
  const types: MovementType[] = [];
  if (access.canCreateEntry) types.push("entry");
  if (access.canWriteCentral) types.push("transfer", "adjustment");
  if (access.canCreateProjectMovement) types.push("consumption", "return");
  return types;
}

export function InventoryMovementDialog({
  access,
  materials,
  projects,
}: {
  access: Access;
  materials: Material[];
  projects: Project[];
}) {
  const createDocument = useMutation(api.inventory.createDocument);
  const postDocument = useMutation(api.inventory.postDocument);
  const types = allowedTypes(access);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<MovementType>(types[0] ?? "entry");
  const [projectId, setProjectId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<FormLine[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);

  // Base UI: `items` faz o trigger exibir o rótulo em vez do valor/id bruto.
  const typeItems = useMemo(
    () =>
      Object.fromEntries(types.map((movementType) => [movementType, MOVEMENT_LABELS[movementType]])),
    [types]
  );
  const projectItems = useMemo(
    () => Object.fromEntries(projects.map((project) => [project._id, project.name])),
    [projects]
  );
  const materialItems = useMemo(
    () =>
      Object.fromEntries(
        materials.map((material) => [
          material._id,
          material.sku
            ? `${material.name} (${material.sku})`
            : material.name,
        ])
      ),
    [materials]
  );

  const requiresProject = type !== "entry" && type !== "adjustment";
  const canPostImmediately =
    (type === "entry" && access.canCreateEntry) ||
    ((type === "transfer" || type === "adjustment" || type === "return") &&
      access.canWriteCentral) ||
    (type === "consumption" && access.canCreateProjectMovement);

  function reset() {
    setType(types[0] ?? "entry");
    setProjectId("");
    setReference("");
    setNotes("");
    setLines([emptyLine()]);
  }

  function updateLine(index: number, patch: Partial<FormLine>) {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line
      )
    );
  }

  async function submit() {
    const parsedLines = lines.map((line) => ({
      materialId: line.materialId,
      quantity: Number(line.quantity.replace(",", ".")),
    }));
    if (requiresProject && !projectId) {
      toast.error("Selecione a obra");
      return;
    }
    if (
      parsedLines.some(
        (line) => !line.materialId || !Number.isFinite(line.quantity)
      )
    ) {
      toast.error("Preencha o material e a quantidade de todas as linhas");
      return;
    }

    setSubmitting(true);
    try {
      const result = await createDocument({
        type,
        projectId: projectId
          ? (projectId as Id<"projects">)
          : undefined,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        lines: parsedLines.map((line) => ({
          materialId: line.materialId as Id<"materials">,
          quantity: line.quantity,
        })),
      });

      if (result.status === "pending_approval") {
        toast.warning(
          `${result.issueCount} incompatibilidade(s) encontrada(s). Aguardando o engenheiro responsável.`
        );
      } else if (canPostImmediately) {
        await postDocument({ documentId: result.documentId });
        toast.success("Movimentação concluída");
      } else {
        toast.success("Movimentação registrada para conclusão pelo Estoque");
      }
      setOpen(false);
      reset();
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao registrar movimentação"));
    } finally {
      setSubmitting(false);
    }
  }

  if (types.length === 0) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button>
            <Plus className="mr-2 size-4" />
            Nova movimentação
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Movimentação em lote</DialogTitle>
          <DialogDescription>
            Registre vários materiais no mesmo documento.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select
              value={type}
              items={typeItems}
              onValueChange={(value) => setType(value as MovementType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {types.map((movementType) => (
                  <SelectItem key={movementType} value={movementType}>
                    {MOVEMENT_LABELS[movementType]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {type !== "entry" && (
            <div className="space-y-1.5">
              <Label>
                Obra {requiresProject ? "" : "(opcional; vazio = central)"}
              </Label>
              <Select
                value={projectId}
                items={projectItems}
                onValueChange={setProjectId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a obra" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project._id} value={project._id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Referência da compra ou documento</Label>
            <Input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Ex.: Pedido 1234"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Informações adicionais"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Materiais</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLines((current) => [...current, emptyLine()])}
              disabled={lines.length >= 100}
            >
              <Plus className="mr-1 size-4" />
              Adicionar linha
            </Button>
          </div>

          {lines.map((line, index) => {
            const material = materials.find(
              (candidate) => candidate._id === line.materialId
            );
            return (
              <div
                key={line.id}
                className="grid gap-2 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[1fr_140px_auto]"
              >
                <Select
                  value={line.materialId}
                  items={materialItems}
                  onValueChange={(value) =>
                    updateLine(index, { materialId: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o material" />
                  </SelectTrigger>
                  <SelectContent>
                    {materials.map((option) => (
                      <SelectItem key={option._id} value={option._id}>
                        {option.sku
                          ? `${option.name} (${option.sku})`
                          : option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Input
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(event) =>
                      updateLine(index, { quantity: event.target.value })
                    }
                    placeholder="Quantidade"
                  />
                  {material?.unit && (
                    <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">
                      {material.unit}
                    </span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover linha ${index + 1}`}
                  disabled={lines.length === 1}
                  onClick={() =>
                    setLines((current) =>
                      current.filter((_, lineIndex) => lineIndex !== index)
                    )
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          })}
          {type === "adjustment" && (
            <p className="text-xs text-muted-foreground">
              Use quantidade negativa para reduzir o saldo no ajuste.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? "Registrando..." : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
