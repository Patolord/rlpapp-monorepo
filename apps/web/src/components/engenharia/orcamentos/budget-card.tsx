import type { api } from "@rlpapp/backend/convex/_generated/api";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { FunctionReturnType } from "convex/server";
import { CalendarDays, Folder, FolderCheck, FolderInput, FolderX, StickyNote } from "lucide-react";

import {
  dueState,
  folderStatus,
  initials,
  shortDate,
  stageLabel,
  type FolderStatus,
} from "@/lib/engenharia/budget-board";
import { cn } from "@/lib/utils";

export type BudgetCardData = FunctionReturnType<typeof api.budgetBoard.list>["cards"][number];

/** Card arrastável: abre o editor no clique (o arrastar só começa depois de 5 px). */
export function SortableBudgetCard({
  card,
  today,
  onOpen,
  disabled,
}: {
  card: BudgetCardData;
  today: string;
  onOpen: (card: BudgetCardData) => void;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card._id,
    data: { stage: card.stage },
    disabled,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
    >
      <BudgetCardView card={card} today={today} onOpen={onOpen} />
    </li>
  );
}

const FOLDER_ICON: Record<Exclude<FolderStatus, "none">, { icon: typeof Folder; className: string }> = {
  ok: { icon: FolderCheck, className: "text-emerald-600" },
  mismatch: { icon: FolderInput, className: "text-amber-600" },
  missing: { icon: FolderX, className: "text-red-600" },
  unchecked: { icon: Folder, className: "text-muted-foreground" },
};

function folderTitle(card: BudgetCardData, status: FolderStatus): string {
  const name = card.folder?.name ?? "pasta";
  switch (status) {
    case "ok":
      return `Pasta na etapa certa: ${name}`;
    case "mismatch":
      return `A pasta "${name}" está em ${stageLabel(card.folder!.stage!)}: mover para ${stageLabel(card.stage)}`;
    case "missing":
      return `A pasta "${name}" não foi achada na TRELLO`;
    case "unchecked":
      return `Pasta ainda não conferida: ${name}`;
    default:
      return "Sem pasta na TRELLO";
  }
}

export function BudgetCardView({
  card,
  today,
  onOpen,
  overlay = false,
}: {
  card: BudgetCardData;
  today: string;
  onOpen?: (card: BudgetCardData) => void;
  overlay?: boolean;
}) {
  const status = folderStatus(card);
  const folderIcon = status === "none" ? null : FOLDER_ICON[status];
  const due = card.dueDate ? dueState(card.dueDate, today) : null;
  const heading = card.client ?? card.title;
  const sub = card.client ? card.title : null;

  return (
    <button
      type="button"
      onClick={() => onOpen?.(card)}
      className={cn(
        "block w-full cursor-grab rounded-md border bg-white p-3 text-left shadow-xs transition-colors active:cursor-grabbing",
        status === "mismatch" || status === "missing"
          ? "border-amber-300"
          : "border-slate-200 hover:border-slate-300",
        overlay && "rotate-1 shadow-lg"
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {card.prcNumber && (
            <p className="font-mono text-[11px] text-muted-foreground">{card.prcNumber}</p>
          )}
          <p className="text-sm font-medium leading-snug">{heading}</p>
          {sub && <p className="text-sm leading-snug text-muted-foreground">{sub}</p>}
        </div>
        {folderIcon && (
          <span title={folderTitle(card, status)} className="mt-0.5 shrink-0">
            <folderIcon.icon className={cn("size-4", folderIcon.className)} aria-hidden />
            <span className="sr-only">{folderTitle(card, status)}</span>
          </span>
        )}
      </div>

      {(due || card.assignees.length > 0 || card.notes) && (
        <div className="mt-2 flex items-center gap-2">
          {card.dueDate && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
                due === "late" && "bg-red-50 text-red-700",
                due === "soon" && "bg-amber-50 text-amber-700",
                due === "ok" && "bg-slate-100 text-muted-foreground"
              )}
              title={due === "late" ? "Prazo vencido" : "Prazo"}
            >
              <CalendarDays className="size-3" />
              {shortDate(card.dueDate)}
            </span>
          )}
          {card.notes && (
            <StickyNote className="size-3.5 text-muted-foreground" aria-label="Tem notas" />
          )}
          <div className="ml-auto flex -space-x-1.5">
            {card.assignees.slice(0, 3).map((user) => (
              <span
                key={user._id}
                title={user.name}
                className="flex size-6 items-center justify-center rounded-full border-2 border-white bg-sky-100 text-[10px] font-semibold text-sky-800"
              >
                {initials(user.name)}
              </span>
            ))}
            {card.assignees.length > 3 && (
              <span className="flex size-6 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-[10px] text-muted-foreground">
                +{card.assignees.length - 3}
              </span>
            )}
          </div>
        </div>
      )}
    </button>
  );
}
