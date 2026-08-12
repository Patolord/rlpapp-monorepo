import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex/react";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  MaterialPickerField,
  type PickedMaterial,
} from "@/components/estoque/material-picker-sheet";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

type Access = FunctionReturnType<typeof api.inventory.getAccess>;
type Project = FunctionReturnType<typeof api.inventory.listProjects>[number];

export type MovementType =
  | "entry"
  | "transfer"
  | "consumption"
  | "return"
  | "adjustment";

type FormLine = {
  id: number;
  material: PickedMaterial | null;
  quantity: string;
};

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  entry: "Entrada no central",
  transfer: "Envio para obra",
  consumption: "Consumo na obra",
  return: "Retorno ao central",
  adjustment: "Ajuste de saldo",
};

let nextLineId = 0;
const emptyLine = (): FormLine => {
  nextLineId += 1;
  return { id: nextLineId, material: null, quantity: "" };
};

export function allowedMovementTypes(
  access: Access,
  scope: "central" | "obra"
): MovementType[] {
  if (scope === "obra") {
    const types: MovementType[] = [];
    if (access.canCreateProjectMovement) types.push("consumption", "return");
    if (access.canWriteCentral) types.push("adjustment");
    return types;
  }
  const types: MovementType[] = [];
  if (access.canCreateEntry) types.push("entry");
  if (access.canWriteCentral) types.push("transfer", "adjustment");
  if (access.canCreateProjectMovement) types.push("consumption", "return");
  return types;
}

export function InventoryMovementForm({
  access,
  projects,
  fixedProjectId,
  scope = "central",
  layout = "page",
  onSuccess,
}: {
  access: Access;
  projects: Project[];
  fixedProjectId?: Id<"projects">;
  scope?: "central" | "obra";
  layout?: "page" | "dialog";
  onSuccess?: () => void;
}) {
  const createDocument = useMutation(api.inventory.createDocument);
  const postDocument = useMutation(api.inventory.postDocument);
  const types = allowedMovementTypes(access, scope);
  const [type, setType] = useState<MovementType>(types[0] ?? "entry");
  const [projectId, setProjectId] = useState(fixedProjectId ?? "");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [lines, setLines] = useState<FormLine[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);

  const typeItems = useMemo(
    () =>
      Object.fromEntries(
        types.map((movementType) => [movementType, MOVEMENT_LABELS[movementType]])
      ),
    [types]
  );
  const projectItems = useMemo(
    () => Object.fromEntries(projects.map((project) => [project._id, project.name])),
    [projects]
  );

  const requiresProject = type !== "entry" && type !== "adjustment";
  const canPostImmediately =
    (type === "entry" && access.canCreateEntry) ||
    ((type === "transfer" || type === "adjustment" || type === "return") &&
      access.canWriteCentral) ||
    (type === "consumption" && access.canCreateProjectMovement);
  const filledCount = lines.filter(
    (line) => line.material && line.quantity.trim()
  ).length;

  function reset() {
    setType(types[0] ?? "entry");
    setProjectId(fixedProjectId ?? "");
    setReference("");
    setNotes("");
    setShowDetails(false);
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
    const retainedLines = lines.filter(
      (line) => line.material || line.quantity.trim()
    );
    const parsedLines = retainedLines.map((line) => {
      const quantityText = line.quantity.trim();
      return {
        materialId: line.material?.materialId,
        quantity: quantityText
          ? Number(quantityText.replace(",", "."))
          : Number.NaN,
      };
    });
    const effectiveProjectId = fixedProjectId ?? projectId;
    if (requiresProject && !effectiveProjectId) {
      toast.error("Selecione a obra");
      return;
    }
    if (
      parsedLines.length === 0 ||
      parsedLines.some((line) => {
        if (!line.materialId || !Number.isFinite(line.quantity)) {
          return true;
        }
        if (type === "adjustment") {
          return line.quantity === 0;
        }
        return line.quantity <= 0;
      })
    ) {
      toast.error("Preencha o material e a quantidade de todas as linhas");
      return;
    }

    setSubmitting(true);
    try {
      const result = await createDocument({
        type,
        projectId: effectiveProjectId
          ? (effectiveProjectId as Id<"projects">)
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
      reset();
      onSuccess?.();
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao registrar movimentação"));
    } finally {
      setSubmitting(false);
    }
  }

  if (types.length === 0) return null;

  const submitLabel = submitting
    ? "Registrando..."
    : filledCount > 0
      ? `Registrar ${filledCount} ${filledCount === 1 ? "item" : "itens"}`
      : "Registrar";

  return (
    <div
      className={cn(
        "flex flex-col gap-5",
        layout === "page" && "min-h-[calc(100dvh-8rem)]"
      )}
    >
      <div className="space-y-2">
        <Label>Tipo</Label>
        {layout === "page" ? (
          <div className="grid grid-cols-2 gap-2">
            {types.map((movementType) => (
              <button
                key={movementType}
                type="button"
                onClick={() => setType(movementType)}
                className={cn(
                  "min-h-12 rounded-xl border px-3 py-2 text-left text-sm font-medium",
                  type === movementType
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-white"
                )}
              >
                {MOVEMENT_LABELS[movementType]}
              </button>
            ))}
          </div>
        ) : (
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
        )}
      </div>

      {type !== "entry" && !fixedProjectId && (
        <div className="space-y-1.5">
          <Label>
            Obra {requiresProject ? "" : "(opcional; vazio = central)"}
          </Label>
          <Select
            value={projectId}
            items={projectItems}
            onValueChange={setProjectId}
          >
            <SelectTrigger className="min-h-12">
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
            Adicionar
          </Button>
        </div>

        {lines.map((line, index) => (
          <div
            key={line.id}
            className="space-y-2 rounded-xl border bg-white p-3"
          >
            <MaterialPickerField
              value={line.material}
              canQuickCreate={access.canQuickCreateMaterial}
              onChange={(material) => updateLine(index, { material })}
            />
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Input
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(event) =>
                    updateLine(index, { quantity: event.target.value })
                  }
                  placeholder="Quantidade"
                  className="h-12 pr-12 text-base"
                />
                {line.material?.unit ? (
                  <span className="absolute right-3 top-3.5 text-xs text-muted-foreground">
                    {line.material.unit}
                  </span>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-12 shrink-0"
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
          </div>
        ))}
        {type === "adjustment" && (
          <p className="text-xs text-muted-foreground">
            Use quantidade negativa para reduzir o saldo no ajuste.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <button
          type="button"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => setShowDetails((current) => !current)}
        >
          {showDetails ? "Ocultar referência e observações" : "Referência e observações"}
        </button>
        {showDetails ? (
          <div className="grid gap-3">
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
        ) : null}
      </div>

      <div
        className={cn(
          layout === "page" &&
            "sticky bottom-0 mt-auto border-t bg-[#f7f8fc] pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        )}
      >
        <Button
          className={cn("w-full", layout === "page" && "h-12")}
          onClick={() => void submit()}
          disabled={submitting}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
