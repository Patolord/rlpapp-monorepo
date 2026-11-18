import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { ExternalLink, FolderInput, Link2, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import type { FolderCheck } from "@/hooks/use-folder-check";
import {
  BUDGET_STAGES,
  folderStatus,
  stageLabel,
  type BudgetStage,
} from "@/lib/engenharia/budget-board";
import { runWithToast } from "@/lib/errors";

import type { BudgetCardData } from "./budget-card";

export type CardDialogTarget =
  | { kind: "create"; stage: BudgetStage }
  | { kind: "edit"; card: BudgetCardData };

interface FormState {
  title: string;
  client: string;
  prcNumber: string;
  stage: BudgetStage;
  assigneeIds: Set<Id<"users">>;
  dueDate: string;
  notes: string;
}

function initialForm(target: CardDialogTarget): FormState {
  if (target.kind === "create") {
    return {
      title: "",
      client: "",
      prcNumber: "",
      stage: target.stage,
      assigneeIds: new Set(),
      dueDate: "",
      notes: "",
    };
  }
  const card = target.card;
  return {
    title: card.title,
    client: card.client ?? "",
    prcNumber: card.prcNumber ?? "",
    stage: card.stage,
    assigneeIds: new Set(card.assignees.map((user) => user._id)),
    dueDate: card.dueDate ?? "",
    notes: card.notes ?? "",
  };
}

/** Criar ou editar um card; na edição, também a pasta da TRELLO dele. */
export function BudgetCardDialog({
  target,
  onClose,
  canEdit,
  orphans,
  onFoldersChanged,
}: {
  target: CardDialogTarget | null;
  onClose: () => void;
  canEdit: boolean;
  /** Pastas ativas sem card (da última conferência), para ligar ao card. */
  orphans: FolderCheck["orphans"];
  onFoldersChanged: () => void;
}) {
  const assignees = useQuery(api.budgetBoard.listAssignees, target ? {} : "skip");
  const create = useMutation(api.budgetBoard.create);
  const update = useMutation(api.budgetBoard.update);
  const move = useMutation(api.budgetBoard.move);
  const remove = useMutation(api.budgetBoard.remove);
  const moveFolder = useAction(api.budgetBoard.moveFolder);
  const linkFolder = useAction(api.budgetBoard.linkFolder);

  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyFolder, setBusyFolder] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [orphanId, setOrphanId] = useState("");

  // O card chega sempre na versão atual (a pasta muda depois de mover); o
  // formulário só recomeça quando abre outro card.
  const targetKey = !target ? null : target.kind === "create" ? `create:${target.stage}` : target.card._id;
  useEffect(() => {
    setForm(target ? initialForm(target) : null);
    setConfirmDelete(false);
    setOrphanId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao trocar de card
  }, [targetKey]);

  if (!target || !form) return null;
  const card = target.kind === "edit" ? target.card : null;
  const status = card ? folderStatus(card) : "none";

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function toggleAssignee(id: Id<"users">) {
    const next = new Set(form!.assigneeIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set("assigneeIds", next);
  }

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    const fields = {
      title: form.title,
      client: form.client || null,
      prcNumber: form.prcNumber || null,
      assigneeIds: [...form.assigneeIds],
      dueDate: form.dueDate || null,
      notes: form.notes || null,
    };
    const ok = await runWithToast(
      async () => {
        if (!card) {
          await create({ ...fields, stage: form.stage });
          return;
        }
        await update({ cardId: card._id, ...fields });
        if (form.stage !== card.stage) {
          await move({ cardId: card._id, stage: form.stage, index: 0 });
        }
      },
      card ? "Card atualizado" : "Card criado",
      "Não foi possível salvar o card"
    );
    setSaving(false);
    if (ok) onClose();
  }

  async function handleDelete() {
    if (!card) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    const ok = await runWithToast(
      () => remove({ cardId: card._id }),
      "Card excluído",
      "Não foi possível excluir o card"
    );
    setSaving(false);
    if (ok) onClose();
  }

  async function handleMoveFolder() {
    if (!card) return;
    setBusyFolder(true);
    await runWithToast(
      () => moveFolder({ cardId: card._id }),
      `Pasta movida para ${stageLabel(card.stage)}`,
      "Não foi possível mover a pasta"
    );
    setBusyFolder(false);
    onFoldersChanged();
  }

  async function handleLinkFolder() {
    if (!card || !orphanId) return;
    setBusyFolder(true);
    const ok = await runWithToast(
      () => linkFolder({ cardId: card._id, itemId: orphanId }),
      "Pasta ligada ao card",
      "Não foi possível ligar a pasta"
    );
    setBusyFolder(false);
    if (ok) onFoldersChanged();
  }

  const readOnly = !canEdit;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{card ? "Orçamento" : "Novo orçamento"}</DialogTitle>
          <DialogDescription>
            {card
              ? "O quadro é a referência: a pasta na TRELLO só é conferida."
              : `Entra no topo de ${stageLabel(form.stage)}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="card-client">Cliente</Label>
            <Input
              id="card-client"
              value={form.client}
              disabled={readOnly}
              onChange={(event) => set("client", event.target.value)}
              placeholder="Tegra Incorporadora"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="card-title">Obra</Label>
            <Input
              id="card-title"
              value={form.title}
              disabled={readOnly}
              onChange={(event) => set("title", event.target.value)}
              placeholder="Obra ARVO"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="card-prc">Nº da proposta</Label>
              <Input
                id="card-prc"
                value={form.prcNumber}
                disabled={readOnly}
                onChange={(event) => set("prcNumber", event.target.value)}
                placeholder="26.37108PRC"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="card-due">Prazo</Label>
              <Input
                id="card-due"
                type="date"
                value={form.dueDate}
                disabled={readOnly}
                onChange={(event) => set("dueDate", event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Etapa</Label>
            <Select
              value={form.stage}
              disabled={readOnly}
              onValueChange={(value) => set("stage", value as BudgetStage)}
            >
              <SelectTrigger aria-label="Etapa">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUDGET_STAGES.map((info) => (
                  <SelectItem key={info.stage} value={info.stage}>
                    {info.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Responsáveis</Label>
            {assignees === undefined ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : (
              <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border p-1.5">
                {assignees.map((user) => (
                  <li key={user._id}>
                    <Label
                      htmlFor={`assignee-${user._id}`}
                      className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-sm font-normal hover:bg-muted/60"
                    >
                      <Checkbox
                        id={`assignee-${user._id}`}
                        checked={form.assigneeIds.has(user._id)}
                        disabled={readOnly}
                        onCheckedChange={() => toggleAssignee(user._id)}
                      />
                      {user.name}
                    </Label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="card-notes">Notas</Label>
            <Textarea
              id="card-notes"
              rows={3}
              value={form.notes}
              disabled={readOnly}
              onChange={(event) => set("notes", event.target.value)}
            />
          </div>

          {card && (
            <div className="grid gap-2 rounded-md border bg-slate-50 p-3 text-sm">
              <p className="font-medium">Pasta na TRELLO</p>
              {card.folder ? (
                <>
                  <a
                    href={card.folder.webUrl ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 break-all text-sky-700 hover:underline"
                  >
                    {card.folder.name ?? "Abrir pasta"}
                    <ExternalLink className="size-3.5 shrink-0" />
                  </a>
                  <p className="text-muted-foreground">
                    {status === "ok" && `Na pasta ${stageLabel(card.stage)}, como o card.`}
                    {status === "mismatch" &&
                      `A pasta está em ${stageLabel(card.folder.stage!)}; o card está em ${stageLabel(card.stage)}.`}
                    {status === "missing" &&
                      "A pasta não foi achada na última conferência (apagada ou movida para fora da TRELLO)."}
                    {status === "unchecked" && "Ainda não conferida."}
                  </p>
                  {status === "mismatch" && canEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="justify-self-start"
                      disabled={busyFolder}
                      onClick={() => void handleMoveFolder()}
                    >
                      {busyFolder ? <Loader2 className="animate-spin" /> : <FolderInput />}
                      Mover pasta para {stageLabel(card.stage)}
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <p className="text-muted-foreground">Este card não tem pasta ligada.</p>
                  {canEdit && orphans.length > 0 && (
                    <div className="flex gap-2">
                      <Select value={orphanId} onValueChange={setOrphanId}>
                        <SelectTrigger aria-label="Pasta sem card" className="min-w-0 flex-1">
                          <SelectValue placeholder="Escolha uma pasta sem card" />
                        </SelectTrigger>
                        <SelectContent>
                          {orphans.map((folder) => (
                            <SelectItem key={folder.itemId} value={folder.itemId}>
                              {folder.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!orphanId || busyFolder}
                        onClick={() => void handleLinkFolder()}
                      >
                        {busyFolder ? <Loader2 className="animate-spin" /> : <Link2 />}
                        Ligar
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {card && canEdit ? (
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={saving}
            >
              <Trash2 />
              {confirmDelete ? "Confirmar exclusão" : "Excluir"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              {canEdit ? "Cancelar" : "Fechar"}
            </Button>
            {canEdit && (
              <Button onClick={() => void handleSave()} disabled={saving || !form.title.trim()}>
                {saving && <Loader2 className="animate-spin" />}
                Salvar
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
