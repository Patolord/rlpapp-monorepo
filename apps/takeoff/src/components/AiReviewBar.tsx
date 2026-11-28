import { Check, MousePointerSquareDashed, Sparkles, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { aiStats, pendingAiIds } from "../lib/aiReview";
import { useStore } from "../store";
import { Button } from "./ui";

/**
 * A line for the dialogs that take the budget out of the app (the sheet, the send to the company
 * app): suggestions nobody reviewed are in its quantities like any other marking, so say so.
 */
export function AiPendingNotice({ className }: { className?: string }) {
  const pending = useStore((s) => aiStats(s.project).pending);
  if (pending === 0) return null;
  return (
    <p className={`whitespace-normal text-amber-300 ${className ?? ""}`}>
      {pending === 1
        ? "Há 1 sugestão da IA ainda sem revisão neste takeoff. Ela entra nas quantidades como está."
        : `Há ${pending} sugestões da IA ainda sem revisão neste takeoff. Elas entram nas quantidades como estão.`}
    </p>
  );
}

/**
 * Floating bar shown while AI suggestions wait for review: how many there are, and accept or
 * discard them, one selection at a time or all at once. Suggestions are drawn dashed with an
 * "IA" tag on the drawing; moving or reshaping one accepts it as corrected.
 */
export function AiReviewBar() {
  const project = useStore((s) => s.project);
  const page = useStore((s) => s.page);
  const selection = useStore((s) => s.selection);
  const similarPreview = useStore((s) => s.similarPreview);
  const { acceptAiSuggestions, rejectAiSuggestions, setSelection, setTool } = useStore.getState();
  const info = useMemo(() => {
    const stats = aiStats(project);
    const here = pendingAiIds(project, { drawingId: project.activeDrawingId, page });
    const pending = new Set(pendingAiIds(project));
    return { stats, here, selected: selection.filter((id) => pending.has(id)) };
  }, [project, page, selection]);
  // the "localizar semelhantes" preview uses the same spot and needs an answer first
  if (info.stats.pending === 0 || similarPreview) return null;
  const { stats, here, selected } = info;
  const reviewed = stats.accepted + stats.edited + stats.rejected;

  return (
    <div className="enter-drop absolute left-1/2 top-3 z-20 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-2 gap-y-1.5 whitespace-nowrap rounded-lg border border-violet-400 bg-neutral-900 px-3 py-2 text-xs shadow-xl">
      <span
        className="flex items-center gap-1.5 font-medium text-violet-700"
        title={
          reviewed > 0
            ? `Já revisadas neste takeoff: ${stats.accepted} aceitas, ${stats.edited} corrigidas, ${stats.rejected} descartadas`
            : "Marcações feitas pelo agente de IA, à espera da sua revisão"
        }
      >
        <Sparkles size={14} />
        {stats.pending} {stats.pending === 1 ? "sugestão da IA" : "sugestões da IA"}
        <span className="font-normal text-neutral-500">· {here.length} nesta página</span>
      </span>
      {selected.length > 0 ? (
        <>
          <Button variant="primary" onClick={() => acceptAiSuggestions(selected)}>
            <Check size={14} /> Aceitar seleção ({selected.length})
          </Button>
          <Button onClick={() => rejectAiSuggestions(selected)}>
            <Trash2 size={14} /> Descartar seleção
          </Button>
        </>
      ) : (
        <>
          <Button
            disabled={here.length === 0}
            onClick={() => {
              setTool("select");
              setSelection(here);
            }}
            title="Seleciona as sugestões desta página, para conferir e aceitar ou descartar"
          >
            <MousePointerSquareDashed size={14} /> Selecionar as desta página
          </Button>
          <Button
            variant="primary"
            onClick={() => acceptAiSuggestions()}
            title="Aceita todas as sugestões pendentes do takeoff, em todas as plantas"
          >
            <Check size={14} /> Aceitar todas
          </Button>
          <Button
            onClick={() => rejectAiSuggestions()}
            title="Apaga todas as sugestões pendentes do takeoff (Ctrl+Z desfaz)"
          >
            <Trash2 size={14} /> Descartar todas
          </Button>
        </>
      )}
    </div>
  );
}
