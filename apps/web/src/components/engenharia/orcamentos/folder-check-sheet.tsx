import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatDateTime } from "@rlpapp/shared";
import { useAction } from "convex/react";
import { ExternalLink, FolderInput, FolderPlus, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { FolderCheck } from "@/hooks/use-folder-check";
import {
  BUDGET_STAGES,
  folderStatus,
  stageLabel,
  type BudgetStage,
} from "@/lib/engenharia/budget-board";
import { runWithToast } from "@/lib/errors";

import type { BudgetCardData } from "./budget-card";

/** Pendências entre o quadro e as pastas: quanto falta para a TRELLO refletir o quadro. */
export function countFolderIssues(cards: BudgetCardData[], check: FolderCheck | null): number {
  const mismatched = cards.filter((card) => {
    const status = folderStatus(card);
    return status === "mismatch" || status === "missing";
  }).length;
  return mismatched + (check?.orphans.length ?? 0);
}

/**
 * Conferência das pastas da TRELLO: contagem por etapa (quadro x pastas),
 * pastas fora da etapa do card (com "mover pasta"), pastas sem card (com
 * "criar card") e pastas não encontradas.
 */
export function FolderCheckSheet({
  open,
  onOpenChange,
  cards,
  truncated,
  check,
  checkError,
  checking,
  canEdit,
  onRefresh,
  onOpenCard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cards: BudgetCardData[];
  truncated: BudgetStage[];
  check: FolderCheck | null;
  checkError: string | null;
  checking: boolean;
  canEdit: boolean;
  onRefresh: () => void;
  onOpenCard: (card: BudgetCardData) => void;
}) {
  const moveFolder = useAction(api.budgetBoard.moveFolder);
  const importFolders = useAction(api.budgetBoard.importFolders);
  const [busy, setBusy] = useState<string | null>(null);

  const mismatched = cards.filter((card) => folderStatus(card) === "mismatch");
  const missing = cards.filter((card) => folderStatus(card) === "missing");
  const withoutFolder = cards.filter(
    (card) => !card.folder && (card.stage === "para_fazer" || card.stage === "em_andamento")
  );
  const orphans = check?.orphans ?? [];

  async function move(cardIds: Id<"budgetCards">[], key: string) {
    setBusy(key);
    for (const cardId of cardIds) {
      const card = cards.find((candidate) => candidate._id === cardId)!;
      await runWithToast(
        () => moveFolder({ cardId }),
        `Pasta de "${card.client ?? card.title}" movida para ${stageLabel(card.stage)}`,
        "Não foi possível mover a pasta"
      );
    }
    setBusy(null);
    onRefresh();
  }

  async function importAll(itemIds: string[], key: string) {
    setBusy(key);
    await runWithToast(
      () => importFolders({ itemIds }),
      itemIds.length === 1 ? "Card criado" : `${itemIds.length} cards criados`,
      "Não foi possível criar os cards"
    );
    setBusy(null);
    onRefresh();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Conferência das pastas</SheetTitle>
          <SheetDescription>
            O quadro é a referência. Aqui aparece o que falta arrumar na pasta TRELLO do SharePoint
            para ela ficar igual ao quadro.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-6 text-sm">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {check ? `Conferido em ${formatDateTime(check.checkedAt)}` : "Ainda não conferido"}
            <Button
              variant="ghost"
              size="xs"
              className="ml-auto"
              disabled={checking}
              onClick={onRefresh}
            >
              <RefreshCw className={checking ? "animate-spin" : undefined} />
              Conferir de novo
            </Button>
          </div>
          {checkError && <p className="text-destructive">{checkError}</p>}

          <section>
            <h3 className="mb-2 font-medium">Contagem por etapa</h3>
            <table className="w-full text-left">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 font-normal">Etapa</th>
                  <th className="py-1 text-right font-normal">Cards</th>
                  <th className="py-1 text-right font-normal">Pastas</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {BUDGET_STAGES.map(({ stage, label }) => {
                  const folder = check?.stages.find((candidate) => candidate.stage === stage);
                  const cardCount = cards.filter((card) => card.stage === stage).length;
                  return (
                    <tr key={stage} className="border-t">
                      <td className="py-1.5">{label}</td>
                      <td className="py-1.5 text-right">
                        {cardCount}
                        {truncated.includes(stage) && "+"}
                      </td>
                      <td className="py-1.5 text-right">
                        {folder ? (
                          <a
                            href={folder.webUrl ?? undefined}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 hover:underline"
                          >
                            {folder.folderCount}
                            <ExternalLink className="size-3 text-muted-foreground" />
                          </a>
                        ) : (
                          "–"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-1 text-xs text-muted-foreground">
              Em Concluído e Obsoletos as pastas antigas não precisam de card.
            </p>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="font-medium">Pasta fora da etapa do card ({mismatched.length})</h3>
              {canEdit && mismatched.length > 1 && (
                <Button
                  variant="outline"
                  size="xs"
                  className="ml-auto"
                  disabled={busy !== null}
                  onClick={() => void move(mismatched.map((card) => card._id), "move-all")}
                >
                  {busy === "move-all" ? <Loader2 className="animate-spin" /> : <FolderInput />}
                  Mover todas
                </Button>
              )}
            </div>
            {mismatched.length === 0 ? (
              <p className="text-muted-foreground">Nenhuma: as pastas estão na etapa dos cards.</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {mismatched.map((card) => (
                  <li key={card._id} className="flex items-center gap-2 px-3 py-2">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left hover:underline"
                      onClick={() => onOpenCard(card)}
                    >
                      <span className="block truncate">{card.folder?.name ?? card.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {stageLabel(card.folder!.stage!)} → {stageLabel(card.stage)}
                      </span>
                    </button>
                    {canEdit && (
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={busy !== null}
                        onClick={() => void move([card._id], card._id)}
                      >
                        {busy === card._id ? <Loader2 className="animate-spin" /> : <FolderInput />}
                        Mover
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="font-medium">Pasta sem card ({orphans.length})</h3>
              {canEdit && orphans.length > 1 && (
                <Button
                  variant="outline"
                  size="xs"
                  className="ml-auto"
                  disabled={busy !== null}
                  onClick={() => void importAll(orphans.map((folder) => folder.itemId), "import-all")}
                >
                  {busy === "import-all" ? <Loader2 className="animate-spin" /> : <FolderPlus />}
                  Criar cards para todas
                </Button>
              )}
            </div>
            {orphans.length === 0 ? (
              <p className="text-muted-foreground">
                Nenhuma: toda pasta em Para Fazer e Em Andamento tem card.
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {orphans.map((folder) => (
                  <li key={folder.itemId} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <a
                        href={folder.webUrl ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate hover:underline"
                      >
                        {folder.name}
                      </a>
                      <span className="text-xs text-muted-foreground">
                        {stageLabel(folder.stage)}
                        {folder.group && ` / ${folder.group}`}
                      </span>
                    </div>
                    {canEdit && (
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={busy !== null}
                        onClick={() => void importAll([folder.itemId], folder.itemId)}
                      >
                        {busy === folder.itemId ? <Loader2 className="animate-spin" /> : <FolderPlus />}
                        Criar card
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Pasta de organização (não é um orçamento)? Mova ou apague no SharePoint.
            </p>
          </section>

          {missing.length > 0 && (
            <section>
              <h3 className="mb-2 font-medium">Pasta não encontrada ({missing.length})</h3>
              <ul className="divide-y rounded-md border">
                {missing.map((card) => (
                  <li key={card._id} className="px-3 py-2">
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => onOpenCard(card)}
                    >
                      {card.folder?.name ?? card.title}
                    </button>
                    <p className="text-xs text-muted-foreground">
                      Apagada ou movida para fora da TRELLO.
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {withoutFolder.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {withoutFolder.length === 1
                ? "1 card ativo ainda não tem pasta: abra o card para ligar uma."
                : `${withoutFolder.length} cards ativos ainda não têm pasta: abra o card para ligar uma.`}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
