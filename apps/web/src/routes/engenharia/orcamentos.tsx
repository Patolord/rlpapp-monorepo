import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ExternalLink, FolderSearch, Loader2, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import { BudgetBoard, type StageFolderInfo } from "@/components/engenharia/orcamentos/budget-board";
import type { BudgetCardData } from "@/components/engenharia/orcamentos/budget-card";
import {
  BudgetCardDialog,
  type CardDialogTarget,
} from "@/components/engenharia/orcamentos/budget-card-dialog";
import {
  FolderCheckSheet,
  countFolderIssues,
} from "@/components/engenharia/orcamentos/folder-check-sheet";
import { PermissionGate } from "@/components/role-area-gate";
import { Button, buttonVariants } from "@/components/ui/button";
import { useCan } from "@/hooks/use-can";
import { useFolderCheck } from "@/hooks/use-folder-check";
import { todayIso, type BudgetStage } from "@/lib/engenharia/budget-board";

export const Route = createFileRoute("/engenharia/orcamentos")({
  component: () => (
    <PermissionGate permissions={["orcamentos.quadro.read"]}>
      <AuthShell>
        <OrcamentosPage />
      </AuthShell>
    </PermissionGate>
  ),
});

type DialogState = { kind: "create"; stage: BudgetStage } | { kind: "edit"; cardId: Id<"budgetCards"> };

/**
 * Quadro de orçamentos. O quadro é a fonte da verdade (etapa, responsáveis,
 * prazo, notas); as pastas da TRELLO no SharePoint são conferidas ao abrir a
 * página, e a conferência mostra o que falta arrumar nelas.
 */
function OrcamentosPage() {
  const board = useQuery(api.budgetBoard.list);
  const canEdit = useCan("orcamentos.quadro.write");
  const folderCheck = useFolderCheck();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);
  const today = todayIso();

  const cards = useMemo(() => board?.cards ?? [], [board]);
  const stageFolders = useMemo(() => {
    const byStage: Partial<Record<BudgetStage, StageFolderInfo>> = {};
    for (const stage of folderCheck.result?.stages ?? []) byStage[stage.stage] = stage;
    return byStage;
  }, [folderCheck.result]);

  // Sempre a versão atual do card aberto (muda depois de mover a pasta).
  const dialogTarget: CardDialogTarget | null = useMemo(() => {
    if (!dialog) return null;
    if (dialog.kind === "create") return dialog;
    const card = cards.find((candidate) => candidate._id === dialog.cardId);
    return card ? { kind: "edit", card } : null;
  }, [dialog, cards]);

  const issues = countFolderIssues(cards, folderCheck.result);
  const openCard = (card: BudgetCardData) => setDialog({ kind: "edit", cardId: card._id });

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Orçamentos</h1>
          <p className="text-sm text-muted-foreground">
            Arraste os cards entre as etapas. As pastas da TRELLO são conferidas com o quadro.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {folderCheck.result?.webUrl && (
            <a
              href={folderCheck.result.webUrl}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <ExternalLink className="size-4" />
              TRELLO
            </a>
          )}
          <Button variant="outline" size="sm" onClick={() => setCheckOpen(true)}>
            {folderCheck.loading ? <Loader2 className="animate-spin" /> : <FolderSearch />}
            Conferir pastas
            {issues > 0 && (
              <span className="rounded-full bg-amber-100 px-1.5 text-xs font-semibold tabular-nums text-amber-800">
                {issues}
              </span>
            )}
          </Button>
          {canEdit && (
            <Button size="sm" onClick={() => setDialog({ kind: "create", stage: "para_fazer" })}>
              <Plus />
              Novo orçamento
            </Button>
          )}
        </div>
      </div>

      {folderCheck.error && (
        <p className="text-sm text-amber-700">
          {folderCheck.error} O quadro continua funcionando; a conferência das pastas fica pendente.
        </p>
      )}

      {board === undefined ? (
        <p className="text-sm text-muted-foreground">Carregando o quadro…</p>
      ) : (
        <>
          {cards.length === 0 && (folderCheck.result?.orphans.length ?? 0) > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm">
              <span>
                O quadro está vazio, e a TRELLO tem {folderCheck.result!.orphans.length} pastas em Para
                Fazer e Em Andamento.
              </span>
              <Button size="sm" variant="outline" onClick={() => setCheckOpen(true)}>
                Criar cards a partir das pastas
              </Button>
            </div>
          )}
          <BudgetBoard
            cards={cards}
            truncated={board.truncated}
            stageFolders={stageFolders}
            today={today}
            canEdit={canEdit}
            onOpen={openCard}
            onCreate={(stage) => setDialog({ kind: "create", stage })}
          />
        </>
      )}

      <BudgetCardDialog
        target={dialogTarget}
        onClose={() => setDialog(null)}
        canEdit={canEdit}
        orphans={folderCheck.result?.orphans ?? []}
        onFoldersChanged={() => void folderCheck.refresh()}
      />
      <FolderCheckSheet
        open={checkOpen}
        onOpenChange={setCheckOpen}
        cards={cards}
        truncated={board?.truncated ?? []}
        check={folderCheck.result}
        checkError={folderCheck.error}
        checking={folderCheck.loading}
        canEdit={canEdit}
        onRefresh={() => void folderCheck.refresh()}
        onOpenCard={(card) => {
          setCheckOpen(false);
          openCard(card);
        }}
      />
    </div>
  );
}
