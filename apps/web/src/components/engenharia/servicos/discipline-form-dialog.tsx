import { useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { Loader2 } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { runWithToast } from "@/lib/errors";

const NO_SHEET = "__none__";

export type DisciplineInput = {
  _id: Id<"projectDisciplines">;
  name: string;
  budgetSheet: string | null;
  fieldTeam: boolean;
};

/** Cria uma disciplina na obra ou, com `discipline`, edita a que já existe. */
export function DisciplineFormDialog({
  projectId,
  discipline,
  trigger,
}: {
  projectId: Id<"projects">;
  discipline?: DisciplineInput;
  trigger: ReactNode;
}) {
  const isEdit = discipline !== undefined;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [budgetSheet, setBudgetSheet] = useState("");
  const [fieldTeam, setFieldTeam] = useState(true);
  const [saving, setSaving] = useState(false);

  // Só busca com o dialog aberto: há um dialog por linha da lista.
  const suggestions = useQuery(
    api.fieldServices.disciplineSuggestions,
    open ? { projectId } : "skip"
  );
  const createDiscipline = useMutation(
    api.fieldServices.createProjectDiscipline
  );
  const updateDiscipline = useMutation(
    api.fieldServices.updateProjectDiscipline
  );

  function handleOpenChange(next: boolean) {
    if (next) {
      setName(discipline?.name ?? "");
      setBudgetSheet(discipline?.budgetSheet ?? "");
      setFieldTeam(discipline?.fieldTeam ?? true);
    }
    setOpen(next);
  }

  // As sugestões só trazem abas ainda sem disciplina: a aba atual (na edição)
  // e a escolhida entram à parte para o select nunca ficar sem o valor dele.
  const sheetOptions = [
    ...new Set(
      [
        discipline?.budgetSheet ?? "",
        budgetSheet,
        ...(suggestions?.budgetSheets ?? []),
      ].filter(Boolean)
    ),
  ];

  const trimmedName = name.trim();

  async function handleSave() {
    if (!trimmedName) return;
    setSaving(true);
    const ok = await runWithToast(
      () =>
        discipline
          ? updateDiscipline({
              disciplineId: discipline._id,
              name: trimmedName,
              budgetSheet: budgetSheet || null,
              fieldTeam,
            })
          : createDiscipline({
              projectId,
              name: trimmedName,
              budgetSheet: budgetSheet || undefined,
              fieldTeam,
            }),
      isEdit ? "Disciplina atualizada" : "Disciplina criada",
      isEdit
        ? "Não foi possível atualizar a disciplina"
        : "Não foi possível criar a disciplina"
    );
    setSaving(false);
    if (ok) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar disciplina" : "Nova disciplina"}
          </DialogTitle>
          <DialogDescription>
            A equipe registra pelo app as etapas de cada disciplina da obra.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="discipline-name">Nome</Label>
            <Input
              id="discipline-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Infra AC"
              maxLength={60}
              required
            />
          </div>

          {!isEdit && suggestions && (
            <>
              <SuggestionChips
                label="Do orçamento"
                names={suggestions.budgetSheets}
                onPick={(sheet) => {
                  setName(sheet);
                  setBudgetSheet(sheet);
                }}
              />
              <SuggestionChips
                label="Mais usadas"
                names={suggestions.common}
                onPick={setName}
              />
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="discipline-sheet">Aba do orçamento</Label>
            <Select
              value={budgetSheet || NO_SHEET}
              onValueChange={(value) =>
                setBudgetSheet(value === NO_SHEET ? "" : value)
              }
            >
              <SelectTrigger id="discipline-sheet">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SHEET}>Nenhuma</SelectItem>
                {sheetOptions.map((sheet) => (
                  <SelectItem key={sheet} value={sheet}>
                    {sheet}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Liga a disciplina aos locais e materiais previstos no orçamento
              publicado.
            </p>
          </div>

          <div className="space-y-1">
            <Label
              htmlFor="discipline-field-team"
              className="flex cursor-pointer items-center gap-3"
            >
              <Checkbox
                id="discipline-field-team"
                checked={fieldTeam}
                onCheckedChange={(checked) => setFieldTeam(checked === true)}
              />
              A equipe de campo executa
            </Label>
            <p className="pl-7 text-xs text-muted-foreground">
              Desligado: outra equipe ou terceiro executa, e o técnico só
              acompanha.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !trimmedName}>
              {saving && <Loader2 className="animate-spin" />}
              {isEdit ? "Salvar" : "Criar disciplina"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SuggestionChips({
  label,
  names,
  onPick,
}: {
  label: string;
  names: string[];
  onPick: (name: string) => void;
}) {
  if (names.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {names.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => onPick(name)}
            className="rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}
