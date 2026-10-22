import { ChevronLeft, ChevronRight, Proportions } from "lucide-react";
import { useEffect, useState } from "react";
import { pageScale } from "../lib/quantities";
import { useDoc } from "../lib/session";
import { useStore } from "../store";
import { useViewport } from "../viewport";
import { ScalePicker } from "./ScalePicker";
import { Kbd } from "./ui";

const HINTS: Record<string, React.ReactNode> = {
  select: (
    <>
      Clique para selecionar · arraste para mover · <Kbd>Alt</Kbd>+clique num texto nomeia o item ·{" "}
      <Kbd>Alt</Kbd>+arraste sobre a legenda cria itens
    </>
  ),
  pan: "Arraste para mover a vista · roda do mouse para zoom",
  count: "Clique para marcar uma contagem",
  linear: (
    <>
      Clique nos pontos · <Kbd>Enter</Kbd>, duplo clique ou botão direito para concluir ·{" "}
      <Kbd>Backspace</Kbd> desfaz um ponto
    </>
  ),
  area: (
    <>
      Clique nos pontos · clique no primeiro ponto ou <Kbd>Enter</Kbd> para fechar
    </>
  ),
  rect: "Arraste um retângulo",
  magic: "Clique dentro de um ambiente fechado para detectar o contorno",
  calibrate: "Clique em dois pontos de distância conhecida",
  similar: (
    <>
      Arraste uma caixa ao redor de um símbolo: todos os iguais na página recebem uma marca de
      contagem · <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd> abre o catálogo
    </>
  ),
  zone: (
    <>
      Delimite o local clicando nos pontos · clique no primeiro ponto ou <Kbd>Enter</Kbd> para
      fechar e dar nome
    </>
  ),
};

export function StatusBar() {
  const page = useStore((s) => s.page);
  const tool = useStore((s) => s.tool);
  const snap = useStore((s) => s.snap);
  const ortho = useStore((s) => s.ortho);
  const status = useStore((s) => s.status);
  const scale = useStore((s) => pageScale(s.project, s.page));
  const selCount = useStore((s) => s.selection.length);
  const zoneFilterName = useStore((s) =>
    s.zoneFilter === null
      ? null
      : s.zoneFilter === ""
        ? "Sem local"
        : (s.project.zones.find((z) => z.id === s.zoneFilter)?.name ?? null),
  );
  const setZoneFilter = useStore((s) => s.setZoneFilter);
  const open = useStore((s) => s.scalePickerOpen);
  const numPages = useDoc((s) => s.numPages);
  const { setPage, setScalePickerOpen } = useStore.getState();
  const [zoom, setZoom] = useState(useViewport.getState().zoom);
  useEffect(() => useViewport.subscribe((v) => setZoom(v.zoom)), []);

  return (
    <div className="relative flex h-7 items-center gap-3 border-t border-neutral-800 bg-neutral-900 px-2 text-[11px] text-neutral-400">
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          className="rounded p-0.5 hover:bg-neutral-700 disabled:opacity-30"
          disabled={page <= 0}
          onClick={() => setPage(page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="font-mono text-neutral-200">
          {numPages ? page + 1 : 0} / {numPages}
        </span>
        <button
          type="button"
          className="rounded p-0.5 hover:bg-neutral-700 disabled:opacity-30"
          disabled={page >= numPages - 1}
          onClick={() => setPage(page + 1)}
          aria-label="Próxima página"
        >
          <ChevronRight size={14} />
        </button>
      </div>
      <span className="font-mono">{(zoom * 100).toFixed(0)}%</span>
      <button
        type="button"
        onClick={() => setScalePickerOpen(!open)}
        className={`flex items-center gap-1 rounded px-1.5 py-0.5 ring-1 ${
          scale
            ? "ring-neutral-700 text-neutral-200 hover:bg-neutral-700"
            : "bg-amber-500/15 text-amber-300 ring-amber-500/50"
        }`}
        title="Escala da página"
      >
        <Proportions size={12} />
        {scale ? scale.label : "Definir escala"}
      </button>
      <span className={snap ? "text-orange-300" : ""}>snap {snap ? "ligado" : "desligado"}</span>
      <span className={ortho ? "text-orange-300" : ""}>orto {ortho ? "ligado" : "desligado"}</span>
      {zoneFilterName && (
        <button
          type="button"
          onClick={() => setZoneFilter(null)}
          title="Limpar o filtro de local"
          className="rounded bg-orange-500/15 px-1.5 py-0.5 text-orange-300 ring-1 ring-orange-400/60"
        >
          local: {zoneFilterName} ×
        </button>
      )}
      {selCount > 0 && (
        <span className="text-neutral-200">
          {selCount} {selCount === 1 ? "selecionado" : "selecionados"}
        </span>
      )}
      <span className="ml-auto truncate text-neutral-500">{status ?? HINTS[tool]}</span>
      {open && <ScalePicker onClose={() => setScalePickerOpen(false)} />}
    </div>
  );
}
