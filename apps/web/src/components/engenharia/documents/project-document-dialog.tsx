import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { FileText, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/errors";
import {
  INVALID_PDF_MESSAGE,
  MAX_PDF_BYTES,
  TECHNICIAN_ACCESS_OPTIONS,
  formatFileSize,
  hasPdfSignature,
  isPdfFile,
  suggestDocumentName,
  uploadPdf,
  type TechnicianAccess,
} from "@/lib/project-documents";
import { cn } from "@/lib/utils";

export type EditableDocument = {
  _id: Id<"projectDocuments">;
  name: string;
  description: string | null;
  technicianAccess: TechnicianAccess;
  allowedTechnicians: Array<{ _id: Id<"users"> }>;
};

/**
 * Envio (novo PDF) ou edição (nome, descrição e acesso) de um documento da
 * obra. Em modo de envio o arquivo é obrigatório.
 */
export function ProjectDocumentDialog({
  projectId,
  document,
  trigger,
}: {
  projectId: Id<"projects">;
  document?: EditableDocument;
  trigger: ReactNode;
}) {
  const isEdit = Boolean(document);
  const technicians = useQuery(api.projects.getAssignedTechnicians, {
    projectId,
  });
  const generateUploadUrl = useMutation(api.projectDocuments.generateUploadUrl);
  const discardUpload = useMutation(api.projectDocuments.discardUpload);
  const createDocument = useMutation(api.projectDocuments.create);
  const updateDocument = useMutation(api.projectDocuments.update);

  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [access, setAccess] = useState<TechnicianAccess>("all");
  const [selected, setSelected] = useState<Set<Id<"users">>>(new Set());
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setName(document?.name ?? "");
    setDescription(document?.description ?? "");
    setAccess(document?.technicianAccess ?? "all");
    setSelected(
      new Set(document?.allowedTechnicians.map((t) => t._id) ?? [])
    );
  }, [open, document]);

  async function pickFile(next: File | null) {
    // Qualquer escolha substitui a anterior: um arquivo recusado não pode
    // deixar o anterior "preso" no formulário. Limpar o input permite
    // escolher o mesmo arquivo de novo.
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!next) return;

    if (!isPdfFile(next)) {
      toast.error("Apenas arquivos PDF são aceitos");
      return;
    }
    if (next.size > MAX_PDF_BYTES) {
      toast.error("O PDF deve ter no máximo 50 MB");
      return;
    }
    if (!(await hasPdfSignature(next))) {
      toast.error(INVALID_PDF_MESSAGE);
      return;
    }
    setFile(next);
    if (!name.trim()) setName(suggestDocumentName(next.name));
  }

  function toggleTechnician(id: Id<"users">) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isEdit && !file) {
      toast.error("Escolha um arquivo PDF");
      return;
    }
    if (access === "selected" && selected.size === 0) {
      toast.error("Marque ao menos um técnico");
      return;
    }

    setSaving(true);
    try {
      const allowedTechnicianIds =
        access === "selected" ? [...selected] : undefined;
      if (isEdit && document) {
        await updateDocument({
          documentId: document._id,
          name,
          description: description.trim() ? description : null,
          technicianAccess: access,
          allowedTechnicianIds,
        });
        toast.success("Documento atualizado");
      } else if (file) {
        const storageId = await uploadPdf(generateUploadUrl, file);
        try {
          await createDocument({
            projectId,
            storageId,
            name,
            description: description.trim() || undefined,
            technicianAccess: access,
            allowedTechnicianIds,
          });
        } catch (error) {
          // O arquivo já subiu; sem cadastro ele ficaria órfão no storage.
          await discardUpload({ storageId }).catch(() => undefined);
          throw error;
        }
        toast.success("PDF enviado");
      }
      setOpen(false);
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          isEdit ? "Não foi possível salvar" : "Não foi possível enviar o PDF"
        )
      );
    } finally {
      setSaving(false);
    }
  }

  const noTechnicians = technicians !== undefined && technicians.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar documento" : "Enviar PDF para a obra"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Ajuste o nome, a descrição e quem pode ver em campo."
              : "O arquivo fica disponível para os técnicos escolhidos verem e baixarem no celular."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-5">
          {!isEdit && (
            <div className="grid gap-2">
              <Label>Arquivo PDF</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={(event) =>
                  void pickFile(event.target.files?.[0] ?? null)
                }
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void pickFile(event.dataTransfer.files?.[0] ?? null);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border border-dashed p-4 text-left transition-colors",
                  "hover:border-foreground/30 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  file && "border-solid border-primary/40 bg-primary/5"
                )}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-background">
                  {file ? (
                    <FileText className="size-5 text-primary" />
                  ) : (
                    <Upload className="size-5 text-muted-foreground" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  {file ? (
                    <>
                      <span className="block truncate text-sm font-medium">
                        {file.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {formatFileSize(file.size)} · toque para trocar
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="block text-sm font-medium">
                        Escolher PDF
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Ou arraste o arquivo até aqui · até 50 MB
                      </span>
                    </>
                  )}
                </span>
              </button>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="doc-name">Nome</Label>
            <Input
              id="doc-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Planta baixa — 3º pavimento"
              required
              maxLength={160}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="doc-description">
              Descrição{" "}
              <span className="font-normal text-muted-foreground">
                (opcional)
              </span>
            </Label>
            <Textarea
              id="doc-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Revisão, observações para o técnico…"
              rows={2}
              maxLength={500}
            />
          </div>

          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Quem vê em campo</legend>
            <div className="grid gap-2">
              {TECHNICIAN_ACCESS_OPTIONS.map((option) => {
                const checked = access === option.value;
                return (
                  <label
                    key={option.value}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                      checked
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/40"
                    )}
                  >
                    <input
                      type="radio"
                      name="technician-access"
                      value={option.value}
                      checked={checked}
                      onChange={() => setAccess(option.value)}
                      className="mt-1 size-4 accent-primary"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {option.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {access === "selected" && (
            <div className="grid gap-2">
              <Label>Técnicos liberados</Label>
              {technicians === undefined ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : noTechnicians ? (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  Nenhum técnico atribuído a esta obra. Use o botão
                  &quot;Técnicos&quot; no topo da obra para atribuir antes de
                  liberar o documento.
                </p>
              ) : (
                <ul className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                  {technicians.map((tech) => {
                    const id = `doc-tech-${tech._id}`;
                    return (
                      <li key={tech._id}>
                        <Label
                          htmlFor={id}
                          className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2.5 hover:bg-muted/60"
                        >
                          <Checkbox
                            id={id}
                            checked={selected.has(tech._id)}
                            onCheckedChange={() => toggleTechnician(tech._id)}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {tech.name}
                          </span>
                        </Label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              {isEdit ? "Salvar" : saving ? "Enviando…" : "Enviar PDF"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
