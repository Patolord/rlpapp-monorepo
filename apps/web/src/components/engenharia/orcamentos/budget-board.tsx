import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useMutation } from "convex/react";
import { ChevronDown, ExternalLink, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  BUDGET_STAGES,
  applyMove,
  type BudgetStage,
  type StageInfo,
} from "@/lib/engenharia/budget-board";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { BudgetCardView, SortableBudgetCard, type BudgetCardData } from "./budget-card";

const COLUMN_PREFIX = "column:";

const ACCENT: Record<BudgetStage, string> = {
  para_fazer: "bg-amber-500",
  em_andamento: "bg-sky-500",
  concluido: "bg-emerald-500",
  obsoleto: "bg-slate-400",
};

export interface StageFolderInfo {
  name: string;
  webUrl: string | null;
  folderCount: number;
}

/**
 * Quadro: Para Fazer e Em Andamento largas; Concluído e Obsoletos estreitas e
 * recolhidas (dá para soltar um card nelas sem abrir). Arrastar move o card na
 * hora (atualização otimista) e grava em budgetBoard.move.
 */
export function BudgetBoard({
  cards,
  truncated,
  stageFolders,
  today,
  canEdit,
  onOpen,
  onCreate,
}: {
  cards: BudgetCardData[];
  truncated: BudgetStage[];
  stageFolders: Partial<Record<BudgetStage, StageFolderInfo>>;
  today: string;
  canEdit: boolean;
  onOpen: (card: BudgetCardData) => void;
  onCreate: (stage: BudgetStage) => void;
}) {
  const move = useMutation(api.budgetBoard.move).withOptimisticUpdate((store, args) => {
    const board = store.getQuery(api.budgetBoard.list, {});
    if (!board) return;
    store.setQuery(api.budgetBoard.list, {}, {
      ...board,
      cards: applyMove(board.cards, args.cardId, args.stage, args.index),
    });
  });

  const columns = useMemo(() => {
    const byStage = new Map<BudgetStage, BudgetCardData[]>(
      BUDGET_STAGES.map(({ stage }) => [stage, []])
    );
    for (const card of cards) byStage.get(card.stage)!.push(card);
    for (const list of byStage.values()) list.sort((a, b) => a.position - b.position);
    return byStage;
  }, [cards]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<BudgetStage | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function stageOf(id: string | number | undefined | null): BudgetStage | null {
    if (id === undefined || id === null) return null;
    const key = String(id);
    if (key.startsWith(COLUMN_PREFIX)) return key.slice(COLUMN_PREFIX.length) as BudgetStage;
    return cards.find((card) => card._id === key)?.stage ?? null;
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    setOverStage(stageOf(event.over?.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    setOverStage(null);
    const cardId = String(event.active.id);
    const from = stageOf(cardId);
    const to = stageOf(event.over?.id);
    if (!from || !to || !event.over) return;
    const target = columns.get(to)!;
    let index: number;
    if (String(event.over.id).startsWith(COLUMN_PREFIX)) {
      // Soltou na coluna (vazia ou recolhida): vai para o topo.
      index = 0;
    } else if (from === to) {
      const ids = target.map((card) => card._id as string);
      const oldIndex = ids.indexOf(cardId);
      const newIndex = ids.indexOf(String(event.over.id));
      if (oldIndex === newIndex) return;
      index = arrayMove(ids, oldIndex, newIndex).indexOf(cardId);
    } else {
      index = target.findIndex((card) => card._id === event.over!.id);
    }
    move({ cardId: cardId as Id<"budgetCards">, stage: to, index }).catch((error: unknown) => {
      toast.error(getErrorMessage(error, "Não foi possível mover o card."));
    });
  }

  const activeCard = activeId ? cards.find((card) => card._id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setOverStage(null);
      }}
    >
      <div className="flex items-start gap-4 overflow-x-auto pb-4">
        {BUDGET_STAGES.map((info) => (
          <BoardColumn
            key={info.stage}
            info={info}
            cards={columns.get(info.stage)!}
            truncated={truncated.includes(info.stage)}
            folder={stageFolders[info.stage]}
            today={today}
            canEdit={canEdit}
            highlighted={activeId !== null && overStage === info.stage}
            onOpen={onOpen}
            onCreate={onCreate}
          />
        ))}
      </div>
      <DragOverlay>
        {activeCard ? <BudgetCardView card={activeCard} today={today} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function BoardColumn({
  info,
  cards,
  truncated,
  folder,
  today,
  canEdit,
  highlighted,
  onOpen,
  onCreate,
}: {
  info: StageInfo;
  cards: BudgetCardData[];
  truncated: boolean;
  folder: StageFolderInfo | undefined;
  today: string;
  canEdit: boolean;
  highlighted: boolean;
  onOpen: (card: BudgetCardData) => void;
  onCreate: (stage: BudgetStage) => void;
}) {
  const { setNodeRef } = useDroppable({ id: `${COLUMN_PREFIX}${info.stage}` });
  const [expanded, setExpanded] = useState(!info.quiet);
  const count = truncated ? `${cards.length}+` : String(cards.length);

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex shrink-0 flex-col rounded-lg border p-3 transition-colors",
        info.quiet
          ? "w-60 border-slate-200/60 bg-slate-50"
          : "min-w-72 flex-1 basis-80 border-slate-200/70 bg-slate-100/70",
        highlighted && "border-sky-300 bg-sky-50/70"
      )}
    >
      <header className="flex items-center gap-2 px-1">
        <span className={cn("size-2 rounded-full", ACCENT[info.stage])} aria-hidden />
        <h2 className={cn("text-sm font-semibold", info.quiet && "text-muted-foreground")}>
          {info.label}
        </h2>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
          {count}
        </span>
        {folder?.webUrl && (
          <a
            href={folder.webUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            title={`${folder.folderCount} pastas em ${folder.name} no SharePoint`}
          >
            {folder.folderCount} pastas
            <ExternalLink className="size-3" />
          </a>
        )}
      </header>

      {!info.quiet && canEdit && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 justify-start text-muted-foreground"
          onClick={() => onCreate(info.stage)}
        >
          <Plus />
          Novo orçamento
        </Button>
      )}

      {info.quiet && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="mt-2 flex items-center gap-1 px-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={cn("size-3.5 transition-transform", !expanded && "-rotate-90")} />
          {expanded ? "Esconder" : cards.length > 0 ? "Ver os mais recentes" : "Solte um card aqui"}
        </button>
      )}

      {expanded && (
        <SortableContext items={cards.map((card) => card._id)} strategy={verticalListSortingStrategy}>
          <ul className="mt-2 min-h-12 space-y-2">
            {cards.map((card) => (
              <SortableBudgetCard
                key={card._id}
                card={card}
                today={today}
                onOpen={onOpen}
                disabled={!canEdit}
              />
            ))}
          </ul>
          {cards.length === 0 && !info.quiet && (
            <p className="px-1 pb-4 text-center text-sm text-muted-foreground">Nenhum orçamento aqui.</p>
          )}
          {truncated && (
            <p className="px-1 pt-2 text-[11px] text-muted-foreground">
              Mostrando os {cards.length} mais recentes.
            </p>
          )}
        </SortableContext>
      )}
    </section>
  );
}
