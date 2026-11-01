import { Check, X } from "lucide-react";
import { useStore } from "../store";
import { Button, Kbd } from "./ui";

/** Floating confirm bar for the image-based "localizar semelhantes" preview. */
export function SimilarPreviewBar() {
  const preview = useStore((s) => s.similarPreview);
  const threshold = useStore((s) => s.similarThreshold);
  const { setSimilarPreview, setSimilarThreshold, acceptSimilar } = useStore.getState();
  if (!preview) return null;
  const shown = preview.matches
    .map((_, i) => i)
    .filter((i) => preview.matches[i].score >= threshold);
  const excluded = shown.filter((i) => preview.excluded.includes(i)).length;
  const toMark = shown.length - excluded;
  return (
    <div className="enter-drop absolute left-1/2 top-3 z-20 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-3 gap-y-1.5 whitespace-nowrap rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs shadow-xl">
      <span className="font-medium text-neutral-100">
        {shown.length} {shown.length === 1 ? "semelhante" : "semelhantes"}
        {excluded > 0 && (
          <span className="font-normal text-neutral-500"> · {excluded} excluídos</span>
        )}
      </span>
      <label className="flex items-center gap-1.5 text-neutral-400">
        Sensibilidade
        <input
          type="range"
          min={50}
          max={95}
          step={1}
          value={Math.round(threshold * 100)}
          onChange={(e) => setSimilarThreshold(Number(e.target.value) / 100)}
          className="w-32 accent-orange-500"
          title="Quanto menor, mais parecidos são aceitos"
        />
        <span className="w-8 font-mono text-[11px]">{Math.round(threshold * 100)}%</span>
      </label>
      <span className="text-[11px] text-neutral-500">clique num símbolo para excluí-lo</span>
      <Button variant="primary" onClick={() => acceptSimilar()} disabled={toMark === 0}>
        <Check size={14} /> Marcar {toMark} <Kbd>Enter</Kbd>
      </Button>
      <Button onClick={() => setSimilarPreview(null)}>
        <X size={14} /> Cancelar <Kbd>Esc</Kbd>
      </Button>
    </div>
  );
}
